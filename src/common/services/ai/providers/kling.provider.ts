import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { getToolById } from '@/common/config/ai-tools.registry';
import {
    AiFileInput,
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
    AiToolId,
} from '../types';
import { downloadRemoteFile } from '@/common/utils/download-remote-file';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';
import { splitMediaFiles } from '@/common/utils/normalize-upload-mime';
import { probeVideoMetadata } from '@/common/utils/probe-video-metadata';
import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';
import { TempPublicMediaService } from '../temp-public-media.service';

const DEFAULT_KLING_API_URL = 'https://api-singapore.klingai.com';
const DEFAULT_MODEL = 'kling-v3';
const MAX_IMAGE_REFS = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/**
 * Video references only work through the Omni model — text2video / image2video /
 * multi-image2video reject video input entirely.
 */
const OMNI_MODEL = 'kling-v3-omni';
/** Omni accepts exactly one reference video. */
const MAX_VIDEO_REFS = 1;
const OMNI_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
/** `refer_type: feature` supports a 3–10 s source clip. */
const OMNI_VIDEO_MIN_SECONDS = 3;
const OMNI_VIDEO_MAX_SECONDS = 10;
const OMNI_VIDEO_MIN_SIDE = 700;
const OMNI_VIDEO_MAX_SIDE = 2160;
const OMNI_VIDEO_MIN_FPS = 24;
const OMNI_VIDEO_MAX_FPS = 60;
/** Omni image refs: JPEG/PNG, both sides ≥ 300 px, aspect 1:2.5 … 2.5:1. */
const OMNI_IMAGE_MIN_SIDE = 300;
const OMNI_IMAGE_MAX_ASPECT = 2.5;
/** Output durations Omni allows with a `feature` video reference. */
const OMNI_OUTPUT_DURATIONS = [5, 10] as const;

type KlingEndpoint =
    | '/v1/videos/text2video'
    | '/v1/videos/image2video'
    | '/v1/videos/multi-image2video'
    | '/v1/videos/omni-video'
    | '/v1/videos/motion-control';

type KlingCreateResponse = {
    code?: number;
    message?: string;
    data?: { task_id?: string; task_status?: string };
};

type KlingStatusResponse = {
    code?: number;
    message?: string;
    data?: {
        task_id?: string;
        task_status?: string;
        task_status_msg?: string;
        task_result?: {
            videos?: Array<{ id?: string; url?: string; duration?: string }>;
        };
    };
};

@Injectable()
export class KlingProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly publicBaseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        private readonly tempPublicMedia: TempPublicMediaService,
        @InjectPinoLogger(KlingProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('KLING_API_KEY') ?? '';
        const rawUrl =
            configService.get<string>('KLING_API_URL') ?? DEFAULT_KLING_API_URL;
        this.baseUrl = rawUrl.replace(/\/$/, '');
        this.publicBaseUrl = (
            configService.get<string>('PUBLIC_BASE_URL') ?? ''
        ).replace(/\/$/, '');
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (toolId !== AiToolId.KLING && toolId !== AiToolId.KLING_MOTION) {
            throw new Error(`Kling provider does not support tool ${toolId}`);
        }

        const tool = getToolById(toolId);
        const model = tool?.model ?? DEFAULT_MODEL;

        const { images, videos } = splitMediaFiles(input.files);
        this.logger.info(
            {
                toolId,
                model,
                imageCount: images.length,
                videoCount: videos.length,
                hasPrompt: Boolean(input.prompt?.trim()),
                orientation: input.klingCharacterOrientation,
                quality: input.quality,
                resolution: input.resolution,
            },
            'Kling createJob start',
        );

        try {
            const { endpoint, body } =
                toolId === AiToolId.KLING_MOTION
                    ? await this.buildMotionBody(model, input)
                    : await this.buildKlingBody(model, input);

            this.logger.info(
                {
                    toolId,
                    endpoint,
                    mode: body.mode,
                    duration: body.duration,
                    hasImageUrl: Boolean(body.image_url || body.image),
                    imageUrlHost:
                        typeof (body.image_url ?? body.image) === 'string' &&
                        String(body.image_url ?? body.image).startsWith('http')
                            ? new URL(String(body.image_url ?? body.image)).host
                            : undefined,
                    hasVideoUrl: Boolean(body.video_url),
                    videoUrlHost:
                        typeof body.video_url === 'string' &&
                        body.video_url.startsWith('http')
                            ? new URL(body.video_url).host
                            : undefined,
                },
                'Kling createJob request',
            );

            const response = await this.post<KlingCreateResponse>(
                endpoint,
                body,
            );
            this.assertApiOk(response);

            const taskId = response.data?.task_id;
            if (!taskId) {
                throw new Error(
                    response.message ?? 'Kling did not return task_id',
                );
            }

            this.logger.info(
                { toolId, endpoint, taskId },
                'Kling createJob accepted',
            );

            return {
                providerJobId: this.encodeJobId(endpoint, taskId),
                estimatedTokenCost: 0,
            };
        } catch (error) {
            this.logger.error(
                {
                    toolId,
                    err: error instanceof Error ? error.message : String(error),
                },
                'Kling createJob failed',
            );
            throw error;
        }
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        this.ensureApiKey();

        const { endpoint, taskId } = this.decodeJobId(providerJobId);
        const response = await this.get<KlingStatusResponse>(
            `${endpoint}/${taskId}`,
        );
        this.assertApiOk(response);

        const taskStatus = response.data?.task_status ?? '';
        const status = this.mapStatus(taskStatus);

        if (status === 'completed') {
            const videoUrl = response.data?.task_result?.videos?.[0]?.url;
            if (!videoUrl) {
                return {
                    status: 'failed',
                    errorMessage: 'Kling завершил задачу без URL видео',
                };
            }

            try {
                const { buffer, mimeType } = await downloadRemoteFile(videoUrl);
                return {
                    status,
                    result: {
                        type: 'video',
                        buffer,
                        mimeType: mimeType ?? 'video/mp4',
                        url: videoUrl,
                    },
                };
            } catch (error) {
                this.logger.warn(
                    { err: error instanceof Error ? error.message : error },
                    'Kling result download failed, returning URL',
                );
                return {
                    status,
                    result: {
                        type: 'video',
                        url: videoUrl,
                        mimeType: 'video/mp4',
                    },
                };
            }
        }

        if (status === 'failed') {
            const errorMessage = `Kling: ${
                response.data?.task_status_msg ??
                response.message ??
                'generation failed'
            }`;
            this.logger.error(
                {
                    providerJobId,
                    taskStatus: response.data?.task_status,
                    taskStatusMsg: response.data?.task_status_msg,
                    code: response.code,
                    message: response.message,
                },
                `Kling task failed: ${errorMessage}`,
            );
            return {
                status,
                errorMessage,
            };
        }

        return { status };
    }

    private async buildKlingBody(
        model: string,
        input: AiGenerationInput,
    ): Promise<{ endpoint: KlingEndpoint; body: Record<string, unknown> }> {
        const { images, videos } = splitMediaFiles(input.files);
        if (images.length > MAX_IMAGE_REFS) {
            throw new Error(
                `Kling принимает не больше ${MAX_IMAGE_REFS} изображений`,
            );
        }
        this.validateImageSizes(images);

        if (videos.length > 0) {
            return this.buildOmniVideoBody(input, images, videos);
        }

        const mode = this.resolveMode(input);
        const duration = this.resolveDuration(input.durationSeconds ?? 5);
        const prompt = input.prompt?.trim() ?? '';
        const negativePrompt = input.negativePrompt?.trim();
        const sound = this.resolveSound(input);
        const common: Record<string, unknown> = {
            model_name: model,
            mode,
            duration: String(duration),
            watermark_info: { enabled: false },
        };
        if (prompt) common.prompt = prompt;
        if (negativePrompt) common.negative_prompt = negativePrompt;
        if (sound != null) common.sound = sound;

        if (images.length === 0) {
            if (!prompt) {
                throw new Error(
                    'Отправьте текстовый промпт или фото для генерации видео',
                );
            }
            return {
                endpoint: '/v1/videos/text2video',
                body: {
                    ...common,
                    aspect_ratio: input.aspectRatio ?? '16:9',
                },
            };
        }

        if (images.length === 1 || images.length === 2) {
            const image = await this.toImagePayload(images[0]);
            const body: Record<string, unknown> = {
                ...common,
                image,
            };
            if (images.length === 2) {
                body.image_tail = await this.toImagePayload(images[1]);
            }
            return { endpoint: '/v1/videos/image2video', body };
        }

        const imageList = await Promise.all(
            images.slice(0, MAX_IMAGE_REFS).map(async (file) => ({
                image: await this.toImagePayload(file),
            })),
        );

        return {
            endpoint: '/v1/videos/multi-image2video',
            body: {
                ...common,
                aspect_ratio: input.aspectRatio ?? '16:9',
                image_list: imageList,
            },
        };
    }

    /**
     * Video reference via Omni (`refer_type: feature`): the clip supplies style,
     * motion and camera work, and Kling renders a brand-new video from it.
     * Omni forces `sound: off` whenever `video_list` is present.
     */
    private async buildOmniVideoBody(
        input: AiGenerationInput,
        images: AiFileInput[],
        videos: AiFileInput[],
    ): Promise<{ endpoint: KlingEndpoint; body: Record<string, unknown> }> {
        if (videos.length > MAX_VIDEO_REFS) {
            throw new Error(
                'Kling принимает только одно видео-референс. Оставьте один клип.',
            );
        }

        const prompt = input.prompt?.trim();
        if (!prompt) {
            throw new Error(
                'С видео-референсом нужен промпт: опишите, какое видео сгенерировать.',
            );
        }

        const video = await this.prepareOmniReferenceVideo(videos[0]);
        await this.validateOmniReferenceVideo(video);

        // Omni fetches video by URL; images are embedded as JPEG data-URLs so
        // Kling does not re-fetch a host that can serve WebP/HTML and answer
        // "Image pixel is invalid".
        const videoUrl = await this.uploadTempPublicUrl(video, 'video');
        const imageList = await Promise.all(
            images
                .slice(0, MAX_IMAGE_REFS)
                .map(async (file) => ({
                    image_url: await this.toOmniImageDataUrl(file),
                })),
        );

        const body: Record<string, unknown> = {
            model_name: OMNI_MODEL,
            prompt,
            mode: this.resolveMode(input),
            aspect_ratio: input.aspectRatio ?? '16:9',
            duration: String(
                this.resolveOmniDuration(input.durationSeconds ?? 5),
            ),
            video_list: [
                {
                    video_url: videoUrl,
                    // Must be explicit: Omni defaults to `base` (video editing).
                    refer_type: 'feature',
                    keep_original_sound:
                        input.klingKeepOriginalSound === false ? 'no' : 'yes',
                },
            ],
            sound: 'off',
            watermark_info: { enabled: false },
        };

        const negativePrompt = input.negativePrompt?.trim();
        if (negativePrompt) {
            body.negative_prompt = negativePrompt;
        }
        if (imageList.length) {
            body.image_list = imageList;
        }

        return { endpoint: '/v1/videos/omni-video', body };
    }

    /**
     * Force H.264 MP4 before Omni upload — iPhone “mp4” is often HEVC, and
     * Kling then fails with “get the contents of the file”.
     */
    private async prepareOmniReferenceVideo(
        video: AiFileInput,
    ): Promise<AiFileInput> {
        try {
            const buffer = await transcodeVideoToH264(video.buffer, {
                force: true,
                maxSeconds: OMNI_VIDEO_MAX_SECONDS,
            });
            return {
                buffer,
                mimeType: 'video/mp4',
                fileName:
                    video.fileName?.replace(/\.\w+$/i, '.mp4') ??
                    `kling-omni-${Date.now()}.mp4`,
            };
        } catch (error) {
            this.logger.warn(
                { err: error instanceof Error ? error.message : error },
                'Kling Omni video re-encode failed, uploading original',
            );
            return {
                ...video,
                mimeType: 'video/mp4',
                fileName:
                    video.fileName?.replace(/\.\w+$/i, '.mp4') ??
                    `kling-omni-${Date.now()}.mp4`,
            };
        }
    }

    /**
     * Omni image_list wants JPEG/PNG ≥300px. Sending a data-URL avoids
     * third-party hosts returning WebP/HTML that Kling rejects as invalid pixels.
     * Tiny uploads are upscaled to the minimum rather than failing with a cryptic
     * provider error after the user already sees a normal-looking thumbnail.
     */
    private async toOmniImageDataUrl(file: AiFileInput): Promise<string> {
        const prepared = await compressReferenceImage(file);
        if (prepared.buffer.length > MAX_IMAGE_BYTES) {
            throw new Error('Изображение для Kling не больше 10 МБ');
        }

        const sharp = (await import('sharp')).default;
        const rotated = sharp(prepared.buffer).rotate();
        const meta = await rotated.metadata();
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;

        let pipeline = sharp(prepared.buffer).rotate();
        if (width > 0 && height > 0) {
            const aspect = Math.max(width, height) / Math.min(width, height);
            if (aspect > OMNI_IMAGE_MAX_ASPECT + 0.01) {
                throw new Error(
                    'Слишком вытянутое фото. Используйте кадр ближе к обычному (не уже чем примерно 2.5:1).',
                );
            }
            if (width < OMNI_IMAGE_MIN_SIDE || height < OMNI_IMAGE_MIN_SIDE) {
                pipeline = pipeline.resize({
                    width: Math.max(width, OMNI_IMAGE_MIN_SIDE),
                    height: Math.max(height, OMNI_IMAGE_MIN_SIDE),
                    fit: 'inside',
                    withoutEnlargement: false,
                });
            }
        }

        const buffer = await pipeline
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer();

        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }

    /**
     * Omni rejects clips outside its input envelope with an opaque API error, so
     * check up front. Unreadable metadata is not treated as a failure — ffprobe
     * may be missing and Kling remains the source of truth.
     */
    private async validateOmniReferenceVideo(video: AiFileInput) {
        if (video.buffer.length > OMNI_VIDEO_MAX_BYTES) {
            throw new Error('Видео-референс для Kling не больше 200 МБ');
        }

        const meta = await probeVideoMetadata(video.buffer, video.fileName);

        if (
            meta.durationSeconds != null &&
            (meta.durationSeconds < OMNI_VIDEO_MIN_SECONDS ||
                meta.durationSeconds > OMNI_VIDEO_MAX_SECONDS)
        ) {
            throw new Error(
                `Видео-референс должен быть от ${OMNI_VIDEO_MIN_SECONDS} до ${OMNI_VIDEO_MAX_SECONDS} секунд. Обрежьте клип и попробуйте снова.`,
            );
        }

        const side =
            meta.width != null && meta.height != null
                ? { min: Math.min(meta.width, meta.height), max: Math.max(meta.width, meta.height) }
                : null;
        if (side && (side.min < OMNI_VIDEO_MIN_SIDE || side.max > OMNI_VIDEO_MAX_SIDE)) {
            throw new Error(
                `Разрешение видео-референса должно быть от ${OMNI_VIDEO_MIN_SIDE} до ${OMNI_VIDEO_MAX_SIDE} пикселей по стороне.`,
            );
        }

        if (
            meta.fps != null &&
            (meta.fps < OMNI_VIDEO_MIN_FPS - 1 ||
                meta.fps > OMNI_VIDEO_MAX_FPS + 1)
        ) {
            throw new Error(
                `Частота кадров видео-референса должна быть от ${OMNI_VIDEO_MIN_FPS} до ${OMNI_VIDEO_MAX_FPS} fps.`,
            );
        }
    }

    /** Omni with a `feature` reference renders 5 or 10 seconds, never 15. */
    private resolveOmniDuration(durationSeconds: number): number {
        return OMNI_OUTPUT_DURATIONS.reduce((closest, value) =>
            Math.abs(value - durationSeconds) < Math.abs(closest - durationSeconds)
                ? value
                : closest,
        );
    }

    private async buildMotionBody(
        model: string,
        input: AiGenerationInput,
    ): Promise<{ endpoint: KlingEndpoint; body: Record<string, unknown> }> {
        const { images, videos } = splitMediaFiles(input.files);
        if (images.length < 1) {
            throw new Error('Kling Motion: загрузите фото персонажа');
        }
        if (videos.length < 1) {
            throw new Error('Kling Motion: загрузите видео с движением');
        }
        this.validateImageSizes(images.slice(0, 1));
        if (videos[0].buffer.length > MAX_VIDEO_BYTES) {
            throw new Error('Видео для Motion не больше 100 МБ');
        }

        const mode = this.resolveMode(input);
        const orientation =
            input.klingCharacterOrientation === 'video' ? 'video' : 'image';
        const keepSound = input.klingKeepOriginalSound === false ? 'no' : 'yes';

        // Motion requires publicly reachable http(s) URLs for both image and video.
        // Base64 / ephemeral self-host often fails after Railway restart.
        const imageUrl = await this.uploadTempPublicUrl(images[0], 'image');
        const videoUrl = await this.uploadTempPublicUrl(videos[0], 'video');

        const body: Record<string, unknown> = {
            model_name: model,
            image_url: imageUrl,
            video_url: videoUrl,
            character_orientation: orientation,
            mode,
            keep_original_sound: keepSound,
            watermark_info: { enabled: false },
        };

        const prompt = input.prompt?.trim();
        if (prompt) {
            body.prompt = prompt;
        }

        return { endpoint: '/v1/videos/motion-control', body };
    }

    private resolveMode(input: AiGenerationInput): 'std' | 'pro' {
        if (input.quality === 'high' || input.resolution === '1080p') {
            return 'pro';
        }
        if (input.quality === 'standard' || input.resolution === '720p') {
            return 'std';
        }
        return input.resolution === '1080p' ? 'pro' : 'std';
    }

    private resolveSound(input: AiGenerationInput): 'on' | 'off' | undefined {
        if (input.klingSound === true) return 'on';
        if (input.klingSound === false) return 'off';
        return undefined;
    }

    private resolveDuration(durationSeconds: number): number {
        const allowed = [5, 10, 15];
        const clamped = Math.min(15, Math.max(5, Math.round(durationSeconds)));
        return allowed.reduce((closest, value) =>
            Math.abs(value - clamped) < Math.abs(closest - clamped)
                ? value
                : closest,
        );
    }

    private validateImageSizes(images: AiFileInput[]) {
        for (const image of images) {
            if (image.buffer.length > MAX_IMAGE_BYTES) {
                throw new Error('Изображение для Kling не больше 10 МБ');
            }
        }
    }

    /** Raw base64 (no data-URI prefix) or public URL. */
    private async toImagePayload(file: AiFileInput): Promise<string> {
        if (this.publicBaseUrl) {
            try {
                return this.publishTempUrl(file);
            } catch (error) {
                this.logger.warn(
                    { err: error instanceof Error ? error.message : error },
                    'Kling image temp URL publish failed, using base64',
                );
            }
        }
        return file.buffer.toString('base64');
    }

    /**
     * Motion and Omni media must be public http(s) URLs that Kling can fetch.
     * Prefer durable public hosts (catbox / 0x0) over in-memory PUBLIC_BASE_URL —
     * Railway restarts wipe TempPublicMediaService and Kling then gets 404.
     */
    private async uploadTempPublicUrl(
        file: AiFileInput,
        kind: 'image' | 'video' = 'video',
    ): Promise<string> {
        const fileName = this.resolveUploadFileName(file, kind);
        const errors: string[] = [];
        const label = kind === 'image' ? 'image' : 'video';

        try {
            const url = await this.uploadToCatbox(file, fileName);
            this.logger.info(
                {
                    kind,
                    fileName,
                    bytes: file.buffer.length,
                    host: 'catbox',
                    url,
                },
                `Kling ${label} uploaded to catbox`,
            );
            return url;
        } catch (error) {
            errors.push(`catbox: ${this.formatError(error)}`);
        }

        try {
            const url = await this.uploadTo0x0(file, fileName);
            this.logger.info(
                { kind, fileName, bytes: file.buffer.length, host: '0x0', url },
                `Kling ${label} uploaded to 0x0.st`,
            );
            return url;
        } catch (error) {
            errors.push(`0x0: ${this.formatError(error)}`);
        }

        if (this.publicBaseUrl) {
            try {
                const url = this.publishTempUrl(file);
                this.logger.warn(
                    {
                        kind,
                        fileName,
                        bytes: file.buffer.length,
                        host: 'self',
                        url,
                    },
                    `Kling ${label} fallback to PUBLIC_BASE_URL (ephemeral)`,
                );
                return url;
            } catch (error) {
                errors.push(`self: ${this.formatError(error)}`);
            }
        } else {
            errors.push('self: PUBLIC_BASE_URL is not configured');
        }

        this.logger.error({ kind, errors }, `Kling ${label} upload failed`);
        throw new Error(
            kind === 'image'
                ? 'Kling: не удалось опубликовать фото. Попробуйте другое фото или позже.'
                : 'Kling: не удалось опубликовать видео-референс. Попробуйте другое видео или позже.',
        );
    }

    private publishTempUrl(file: AiFileInput): string {
        if (!this.publicBaseUrl) {
            throw new Error('PUBLIC_BASE_URL is not configured');
        }
        const id = this.tempPublicMedia.put({
            buffer: file.buffer,
            mimeType: file.mimeType,
            fileName: file.fileName,
        });
        return `${this.publicBaseUrl}/api/public/tmp/${id}`;
    }

    private async uploadToCatbox(
        file: AiFileInput,
        fileName: string,
    ): Promise<string> {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', file.buffer, {
            filename: fileName,
            contentType: file.mimeType,
        });

        const response = await firstValueFrom(
            this.httpService.post<string>(
                'https://catbox.moe/user/api.php',
                form,
                {
                    headers: form.getHeaders(),
                    timeout: 180_000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    responseType: 'text',
                    transformResponse: [(data) => data],
                },
            ),
        );
        const url = String(response.data ?? '').trim();
        if (!/^https?:\/\//i.test(url)) {
            throw new Error(url || 'empty response');
        }
        return url;
    }

    private async uploadTo0x0(
        file: AiFileInput,
        fileName: string,
    ): Promise<string> {
        const form = new FormData();
        form.append('file', file.buffer, {
            filename: fileName,
            contentType: file.mimeType,
        });

        const response = await firstValueFrom(
            this.httpService.post<string>('https://0x0.st', form, {
                headers: form.getHeaders(),
                timeout: 180_000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                responseType: 'text',
                transformResponse: [(data) => data],
            }),
        );
        const url = String(response.data ?? '').trim();
        if (!/^https?:\/\//i.test(url)) {
            throw new Error(url || 'empty response');
        }
        return url;
    }

    private resolveUploadFileName(
        file: AiFileInput,
        kind: 'image' | 'video' = 'video',
    ): string {
        const raw = file.fileName?.trim();
        if (raw && /\.[a-z0-9]+$/i.test(raw)) {
            return raw.replace(/[^\w.\-]+/g, '_');
        }
        if (kind === 'image') {
            if (file.mimeType.includes('png')) {
                return `kling-${Date.now()}.png`;
            }
            if (file.mimeType.includes('webp')) {
                return `kling-${Date.now()}.webp`;
            }
            return `kling-${Date.now()}.jpg`;
        }
        if (
            file.mimeType.includes('quicktime') ||
            file.mimeType.includes('mov')
        ) {
            return `kling-${Date.now()}.mov`;
        }
        return `kling-${Date.now()}.mp4`;
    }

    private formatError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }

    private encodeJobId(endpoint: KlingEndpoint, taskId: string): string {
        return `${endpoint}|${taskId}`;
    }

    private decodeJobId(providerJobId: string): {
        endpoint: KlingEndpoint;
        taskId: string;
    } {
        const sep = providerJobId.indexOf('|');
        if (sep <= 0) {
            throw new Error(`Invalid Kling job id: ${providerJobId}`);
        }
        const endpoint = providerJobId.slice(0, sep) as KlingEndpoint;
        const taskId = providerJobId.slice(sep + 1);
        if (!taskId) {
            throw new Error(`Invalid Kling job id: ${providerJobId}`);
        }
        return { endpoint, taskId };
    }

    private mapStatus(
        taskStatus: string,
    ): 'pending' | 'processing' | 'completed' | 'failed' {
        const status = taskStatus.toLowerCase();
        if (status === 'succeed' || status === 'success') {
            return 'completed';
        }
        if (status === 'failed' || status === 'error') {
            return 'failed';
        }
        if (status === 'processing' || status === 'running') {
            return 'processing';
        }
        return 'pending';
    }

    private assertApiOk(response: { code?: number; message?: string }) {
        if (response.code != null && response.code !== 0) {
            throw new Error(
                `Kling API: ${response.message ?? `error code ${response.code}`}`,
            );
        }
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            this.logger.error('KLING_API_KEY is missing in environment');
            throw new Error('KLING_API_KEY is not configured');
        }
    }

    private async post<T>(
        path: string,
        body: Record<string, unknown>,
    ): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, body, {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 120_000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }),
            );
            return response.data;
        } catch (error) {
            throw this.wrapHttpError(error, 'create');
        }
    }

    private async get<T>(path: string): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<T>(`${this.baseUrl}${path}`, {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    timeout: 60_000,
                }),
            );
            return response.data;
        } catch (error) {
            throw this.wrapHttpError(error, 'status');
        }
    }

    private wrapHttpError(error: unknown, op: string): Error {
        const axiosError = error as {
            response?: { data?: unknown; status?: number };
            message?: string;
            code?: string;
        };
        const data = axiosError.response?.data;
        const apiMessage =
            data &&
            typeof data === 'object' &&
            'message' in data &&
            typeof data.message === 'string'
                ? (data as { message: string }).message
                : undefined;

        this.logger.error(
            {
                op,
                status: axiosError.response?.status,
                code: axiosError.code,
                data,
                err: axiosError.message ?? String(error),
            },
            `Kling ${op} failed`,
        );

        if (apiMessage) {
            return new Error(`Kling: ${apiMessage}`);
        }
        if (axiosError.response?.status) {
            return new Error(
                `Kling HTTP ${axiosError.response.status}: ${axiosError.message ?? 'request failed'}`,
            );
        }
        return new Error(
            `Kling ${op} failed: ${axiosError.message ?? String(error)}`,
        );
    }
}
