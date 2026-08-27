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
import { splitMediaFiles } from '@/common/utils/normalize-upload-mime';
import { TempPublicMediaService } from '../temp-public-media.service';

const DEFAULT_KLING_API_URL = 'https://api-singapore.klingai.com';
const DEFAULT_MODEL = 'kling-v3';
const MAX_IMAGE_REFS = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

type KlingEndpoint =
    | '/v1/videos/text2video'
    | '/v1/videos/image2video'
    | '/v1/videos/multi-image2video'
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
            return {
                status,
                errorMessage: `Kling: ${
                    response.data?.task_status_msg ??
                    response.message ??
                    'generation failed'
                }`,
            };
        }

        return { status };
    }

    private async buildKlingBody(
        model: string,
        input: AiGenerationInput,
    ): Promise<{ endpoint: KlingEndpoint; body: Record<string, unknown> }> {
        const { images } = splitMediaFiles(input.files);
        if (images.length > MAX_IMAGE_REFS) {
            throw new Error(
                `Kling принимает не больше ${MAX_IMAGE_REFS} изображений`,
            );
        }
        this.validateImageSizes(images);

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

    private async buildMotionBody(
        model: string,
        input: AiGenerationInput,
    ): Promise<{ endpoint: KlingEndpoint; body: Record<string, unknown> }> {
        const { images, videos } = splitMediaFiles(input.files);
        if (images.length < 1) {
            throw new Error(
                'Kling Motion: загрузите фото персонажа',
            );
        }
        if (videos.length < 1) {
            throw new Error(
                'Kling Motion: загрузите видео с движением',
            );
        }
        this.validateImageSizes(images.slice(0, 1));
        if (videos[0].buffer.length > MAX_VIDEO_BYTES) {
            throw new Error(
                'Видео для Motion не больше 100 МБ',
            );
        }

        const mode = this.resolveMode(input);
        const orientation =
            input.klingCharacterOrientation === 'video' ? 'video' : 'image';
        const keepSound =
            input.klingKeepOriginalSound === false ? 'no' : 'yes';

        // Official Kling Motion requires a publicly reachable video URL (not base64).
        const imageUrl = await this.toImagePayload(images[0]);
        const videoUrl = await this.uploadTempPublicUrl(videos[0]);

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
                throw new Error(
                    'Изображение для Kling не больше 10 МБ',
                );
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
     * Motion reference video must be a public http(s) URL.
     * Prefer PUBLIC_BASE_URL, then catbox / 0x0.st (same as Seedance).
     */
    private async uploadTempPublicUrl(file: AiFileInput): Promise<string> {
        const fileName = this.resolveUploadFileName(file);
        const errors: string[] = [];

        if (this.publicBaseUrl) {
            try {
                const url = this.publishTempUrl(file);
                this.logger.info(
                    { fileName, bytes: file.buffer.length, host: 'self' },
                    'Kling motion video published via PUBLIC_BASE_URL',
                );
                return url;
            } catch (error) {
                errors.push(`self: ${this.formatError(error)}`);
            }
        } else {
            errors.push('self: PUBLIC_BASE_URL is not configured');
        }

        try {
            const url = await this.uploadToCatbox(file, fileName);
            this.logger.info(
                { fileName, bytes: file.buffer.length, host: 'catbox' },
                'Kling motion video uploaded to catbox',
            );
            return url;
        } catch (error) {
            errors.push(`catbox: ${this.formatError(error)}`);
        }

        try {
            const url = await this.uploadTo0x0(file, fileName);
            this.logger.info(
                { fileName, bytes: file.buffer.length, host: '0x0' },
                'Kling motion video uploaded to 0x0.st',
            );
            return url;
        } catch (error) {
            errors.push(`0x0: ${this.formatError(error)}`);
        }

        this.logger.error({ errors }, 'Kling motion video upload failed');
        throw new Error(
            'Kling Motion: не удалось опубликовать видео-референс. Попробуйте другое видео или позже.',
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

    private resolveUploadFileName(file: AiFileInput): string {
        const raw = file.fileName?.trim();
        if (raw && /\.[a-z0-9]+$/i.test(raw)) {
            return raw.replace(/[^\w.\-]+/g, '_');
        }
        if (
            file.mimeType.includes('quicktime') ||
            file.mimeType.includes('mov')
        ) {
            return `kling-motion-${Date.now()}.mov`;
        }
        return `kling-motion-${Date.now()}.mp4`;
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
            typeof (data as { message: unknown }).message === 'string'
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
