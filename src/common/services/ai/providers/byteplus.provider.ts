import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import FormData from 'form-data';
import { getToolById } from '@/common/config/ai-tools.registry';
import {
    AiFileInput,
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
} from '../types';
import { AiToolId } from '../types';
import { downloadRemoteFile } from '@/common/utils/download-remote-file';
import { splitMediaFiles } from '@/common/utils/normalize-upload-mime';
import { isImageMedia } from '@/common/utils/media-kind';
import { TempPublicMediaService } from '../temp-public-media.service';

const DEFAULT_BYTEPLUS_API_URL =
    'https://ark.ap-southeast.bytepluses.com/api/v3';
const SEEDANCE_25_MODEL = 'dreamina-seedance-2-5-260628';

/** Resolutions Seedance accepts; anything else falls back to 720p. */
const SEEDANCE_RESOLUTIONS = new Set(['480p', '720p', '1080p']);

const MAX_IMAGES = 30;
const MAX_VIDEOS = 10;
const MAX_AUDIOS = 10;
/** Practical payload cap for data-URI refs (provider allows ~200MB/file). */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type BytePlusContentItem = {
    type: string;
    text?: string;
    role?: string;
    image_url?: { url: string };
    video_url?: { url: string };
    audio_url?: { url: string };
};

type BytePlusCreateTaskResponse = {
    id?: string;
    error?: { message?: string; code?: string };
};

type BytePlusTaskStatusResponse = {
    id?: string;
    status?: string;
    content?: {
        video_url?: string;
        last_frame_url?: string;
    };
    error?: { message?: string; code?: string };
    usage?: { completion_tokens?: number };
};

type SeedanceMode = 'generate' | 'edit' | 'extend' | 'first_last';

@Injectable()
export class BytePlusProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly publicBaseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        private readonly tempPublicMedia: TempPublicMediaService,
        @InjectPinoLogger(BytePlusProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey =
            configService.get<string>('BYTEPLUS_API_KEY') ??
            configService.get<string>('ARK_API_KEY') ??
            '';
        const rawUrl =
            configService.get<string>('BYTEPLUS_API_URL') ??
            DEFAULT_BYTEPLUS_API_URL;
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

        if (toolId !== AiToolId.SEEDANCE) {
            throw new Error(
                `BytePlus supports only Seedance tool, got ${toolId}`,
            );
        }

        const tool = getToolById(toolId);
        const model = tool?.model ?? SEEDANCE_25_MODEL;
        const body = await this.buildSeedanceBody(model, input);

        this.logger.debug(
            {
                toolId,
                model,
                duration: body.duration,
                ratio: body.ratio,
                resolution: body.resolution,
                contentItems: Array.isArray(body.content)
                    ? body.content.length
                    : 0,
            },
            'BytePlus createJob request',
        );

        const response = await this.post<BytePlusCreateTaskResponse>(
            '/contents/generations/tasks',
            body,
        );

        if (!response.id) {
            throw new Error(
                response.error?.message ?? 'BytePlus did not return task id',
            );
        }

        return {
            providerJobId: response.id,
            estimatedTokenCost: 0,
        };
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        this.ensureApiKey();

        const response = await this.get<BytePlusTaskStatusResponse>(
            `/contents/generations/tasks/${providerJobId}`,
        );
        const status = this.mapStatus(response.status ?? '');

        if (status === 'completed') {
            const videoUrl = response.content?.video_url;
            if (!videoUrl) {
                return {
                    status: 'failed',
                    errorMessage: 'BytePlus завершил задачу без URL видео',
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
                    'BytePlus result download failed, returning URL',
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
                errorMessage:
                    response.error?.message ??
                    response.error?.code ??
                    'BytePlus generation failed',
            };
        }

        return { status };
    }

    private async buildSeedanceBody(
        model: string,
        input: AiGenerationInput,
    ): Promise<Record<string, unknown>> {
        const { images, videos, audios } = splitMediaFiles(input.files);
        this.validateMediaCounts(images, videos, audios);
        this.validateFileSizes([...images, ...videos, ...audios]);

        const mode = this.resolveMode(input, images, videos);
        const prompt = this.resolvePrompt(input, mode, images, videos, audios);
        const content = await this.buildContent(
            prompt,
            mode,
            images,
            videos,
            audios,
            this.getFrameRoleOrder(input),
        );

        const resolution =
            input.resolution && SEEDANCE_RESOLUTIONS.has(input.resolution)
                ? input.resolution
                : '720p';

        const body: Record<string, unknown> = {
            model,
            content,
            resolution,
            generate_audio: this.resolveGenerateAudio(input),
        };

        if (mode === 'edit') {
            body.ratio = 'adaptive';
            body.duration = -1;
        } else if (mode === 'extend' || mode === 'first_last') {
            body.ratio = 'adaptive';
            body.duration = this.resolveDuration(input.durationSeconds ?? 5);
        } else {
            body.ratio = input.aspectRatio ?? '16:9';
            body.duration = this.resolveDuration(input.durationSeconds ?? 5);
        }

        return body;
    }

    private resolveMode(
        input: AiGenerationInput,
        images: AiFileInput[],
        videos: AiFileInput[],
    ): SeedanceMode {
        const prompt = (input.prompt ?? '').toLowerCase();

        if (videos.length > 0 && this.isEditPrompt(prompt)) {
            return 'edit';
        }
        if (videos.length > 0 && this.isExtendPrompt(prompt)) {
            return 'extend';
        }

        // In first_last mode the photo becomes the opening frame, so its
        // subject overrides whatever the prompt describes ("девушка" turning
        // into the man from the reference). Use it only when the user asked
        // for frame interpolation, marked start/end frames, or gave no prompt
        // at all — otherwise the images stay plain style references.
        if (videos.length === 0 && images.length >= 1 && images.length <= 2) {
            const framesRequested =
                this.getFrameRoleOrder(input).length > 0 ||
                this.isFrameAnimationPrompt(prompt) ||
                !prompt.trim();
            if (framesRequested) {
                return 'first_last';
            }
        }

        return 'generate';
    }

    private isEditPrompt(prompt: string): boolean {
        return /(замени|удали|убери|измени|отредактир|replace|remove|modify|edit\b)/i.test(
            prompt,
        );
    }

    private isExtendPrompt(prompt: string): boolean {
        return /(продолж|продли|расшир|extend|continue|prolong)/i.test(prompt);
    }

    private isFrameAnimationPrompt(prompt: string): boolean {
        return /(перв\w* кадр|последн\w* кадр|начальн\w* кадр|конечн\w* кадр|оживи|ожив\w* фото|из фото в фото|переход между|first frame|last frame|start frame|end frame|animate (?:the )?photo)/i.test(
            prompt,
        );
    }

    /**
     * Roles the mini-app attached to image files, in image order.
     * `attachmentRoles` is index-aligned with `input.files`, so it has to be
     * filtered by the same predicate `splitMediaFiles` uses for images.
     */
    private getImageRoles(input: AiGenerationInput): (string | undefined)[] {
        const roles = input.attachmentRoles ?? [];
        return (input.files ?? [])
            .map((file, index) => ({ file, role: roles[index] }))
            .filter(({ file }) => isImageMedia(file.mimeType, file.fileName))
            .map(({ role }) => role);
    }

    /**
     * Image indexes to use as [first frame, last frame], empty when the caller
     * marked neither. A missing side is filled from the unmarked images so a
     * lone `end_frame` never ends up as the opening frame.
     */
    private getFrameRoleOrder(input: AiGenerationInput): number[] {
        const roles = this.getImageRoles(input);
        const start = roles.indexOf('start_frame');
        const end = roles.indexOf('end_frame');
        if (start < 0 && end < 0) {
            return [];
        }

        const unmarked = roles
            .map((_, index) => index)
            .filter((index) => index !== start && index !== end);
        const first = start >= 0 ? start : unmarked.shift();
        const last = end >= 0 ? end : undefined;

        return [first, last].filter((index): index is number => index != null);
    }

    private resolvePrompt(
        input: AiGenerationInput,
        mode: SeedanceMode,
        images: AiFileInput[],
        videos: AiFileInput[],
        audios: AiFileInput[],
    ): string {
        const raw = input.prompt?.trim() ?? '';
        const hasMedia =
            images.length > 0 || videos.length > 0 || audios.length > 0;

        if (!raw && !hasMedia) {
            throw new Error(
                'Отправьте текстовый промпт или медиа для генерации видео',
            );
        }

        if (!raw) {
            if (mode === 'first_last') {
                return 'Animate from the first frame to the last frame with natural motion.';
            }
            if (videos.length) {
                return 'Generate a video consistent with the provided references.';
            }
            return 'Generate a cinematic video based on the reference images.';
        }

        const manifest = this.buildAssetManifest(images, videos, audios);
        return manifest ? `${manifest}\n\n${raw}` : raw;
    }

    /**
     * Tags match the @image1 / @video1 / @file1 notation the user types, so the
     * model can resolve them. The closing rule keeps the prompt authoritative
     * for the subject — otherwise a reference photo silently replaces it.
     */
    private buildAssetManifest(
        images: AiFileInput[],
        videos: AiFileInput[],
        audios: AiFileInput[],
    ): string {
        const lines: string[] = [];
        images.forEach((_, i) => {
            lines.push(
                `@image${i + 1}: reference image — appearance, style and scene details only.`,
            );
        });
        videos.forEach((_, i) => {
            lines.push(
                `@video${i + 1}: reference video — motion, timing and camera only.`,
            );
        });
        audios.forEach((_, i) => {
            lines.push(
                `@audio${i + 1}: reference audio — voice, ambience or music only.`,
            );
        });

        if (!lines.length) {
            return '';
        }

        return [
            'Assets referenced by the prompt:',
            ...lines,
            'The prompt text is authoritative for the subject, gender, count, action and scene. References only describe how the subject the prompt asks for should look; never replace a subject described in the prompt with a subject taken from a reference.',
        ].join('\n');
    }

    private async buildContent(
        prompt: string,
        mode: SeedanceMode,
        images: AiFileInput[],
        videos: AiFileInput[],
        audios: AiFileInput[],
        frameOrder: number[] = [],
    ): Promise<BytePlusContentItem[]> {
        const content: BytePlusContentItem[] = [{ type: 'text', text: prompt }];

        if (mode === 'first_last') {
            // Explicit start/end roles win over upload order.
            const ordered = frameOrder.length
                ? frameOrder.map((index) => images[index])
                : images;
            content.push({
                type: 'image_url',
                image_url: { url: this.toDataUrl(ordered[0]) },
                role: 'first_frame',
            });
            if (ordered[1]) {
                content.push({
                    type: 'image_url',
                    image_url: { url: this.toDataUrl(ordered[1]) },
                    role: 'last_frame',
                });
            }
            return content;
        }

        for (const image of images.slice(0, MAX_IMAGES)) {
            content.push({
                type: 'image_url',
                image_url: { url: this.toDataUrl(image) },
                role: 'reference_image',
            });
        }
        for (const video of videos.slice(0, MAX_VIDEOS)) {
            // BytePlus rejects data-URI for reference_video — needs a public HTTP URL.
            const videoUrl = await this.uploadTempPublicUrl(video);
            content.push({
                type: 'video_url',
                video_url: { url: videoUrl },
                role: 'reference_video',
            });
        }
        for (const audio of audios.slice(0, MAX_AUDIOS)) {
            content.push({
                type: 'audio_url',
                audio_url: { url: this.toDataUrl(audio) },
                role: 'reference_audio',
            });
        }

        return content;
    }

    /**
     * BytePlus requires reference_video as a publicly reachable http(s) URL.
     * Prefer our PUBLIC_BASE_URL temp endpoint; fall back to catbox / 0x0.st.
     */
    private async uploadTempPublicUrl(file: AiFileInput): Promise<string> {
        const fileName = this.resolveUploadFileName(file);
        const errors: string[] = [];

        if (this.publicBaseUrl) {
            try {
                const id = this.tempPublicMedia.put({
                    buffer: file.buffer,
                    mimeType: file.mimeType,
                    fileName,
                });
                const url = `${this.publicBaseUrl}/api/public/tmp/${id}`;
                this.logger.debug(
                    { fileName, bytes: file.buffer.length, url, host: 'self' },
                    'BytePlus video ref published via PUBLIC_BASE_URL',
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
            this.logger.debug(
                { fileName, bytes: file.buffer.length, url, host: 'catbox' },
                'BytePlus video ref uploaded to catbox',
            );
            return url;
        } catch (error) {
            errors.push(`catbox: ${this.formatError(error)}`);
        }

        try {
            const url = await this.uploadTo0x0(file, fileName);
            this.logger.debug(
                { fileName, bytes: file.buffer.length, url, host: '0x0' },
                'BytePlus video ref uploaded to 0x0.st',
            );
            return url;
        } catch (error) {
            errors.push(`0x0: ${this.formatError(error)}`);
        }

        this.logger.error({ errors }, 'Temp video upload failed on all hosts');
        throw new Error(
            'Не удалось подготовить видео-референс для Seedance. Попробуйте другое видео или позже.',
        );
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
                    timeout: 180000,
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
                timeout: 180000,
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
            return `ref-${Date.now()}.mov`;
        }
        return `ref-${Date.now()}.mp4`;
    }

    private resolveDuration(durationSeconds: number): number {
        return Math.min(30, Math.max(4, Math.round(durationSeconds)));
    }

    private resolveGenerateAudio(input: AiGenerationInput): boolean {
        const passthrough = input.videoStylePassthrough;
        if (
            passthrough &&
            typeof passthrough === 'object' &&
            'generate_audio' in passthrough
        ) {
            return Boolean(
                (passthrough as { generate_audio?: unknown }).generate_audio,
            );
        }
        return true;
    }

    private validateMediaCounts(
        images: AiFileInput[],
        videos: AiFileInput[],
        audios: AiFileInput[],
    ) {
        if (images.length > MAX_IMAGES) {
            throw new Error(
                `Seedance принимает до ${MAX_IMAGES} изображений-референсов.`,
            );
        }
        if (videos.length > MAX_VIDEOS) {
            throw new Error(
                `Seedance принимает до ${MAX_VIDEOS} видео-референсов.`,
            );
        }
        if (audios.length > MAX_AUDIOS) {
            throw new Error(
                `Seedance принимает до ${MAX_AUDIOS} аудио-референсов.`,
            );
        }
    }

    private validateFileSizes(files: AiFileInput[]) {
        for (const file of files) {
            if (file.buffer.length > MAX_FILE_BYTES) {
                throw new Error(
                    'Файл слишком большой. Отправьте медиа до ~100 МБ.',
                );
            }
        }
    }

    private toDataUrl(file: AiFileInput): string {
        return `data:${file.mimeType};base64,${file.buffer.toString('base64')}`;
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (
            ['succeeded', 'success', 'completed', 'done'].includes(normalized)
        ) {
            return 'completed';
        }
        if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) {
            return 'failed';
        }
        if (['running', 'processing', 'generating'].includes(normalized)) {
            return 'processing';
        }
        if (['queued', 'pending', 'submitted'].includes(normalized)) {
            return 'pending';
        }
        return 'pending';
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error(
                'BYTEPLUS_API_KEY (or ARK_API_KEY) is not configured',
            );
        }
    }

    private getHeaders(): Record<string, string> {
        return {
            accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
        };
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, data, {
                    headers: this.getHeaders(),
                    timeout: 180000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    validateStatus: (status) => status >= 200 && status < 300,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `BytePlus POST ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private async get<T>(path: string): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<T>(`${this.baseUrl}${path}`, {
                    headers: this.getHeaders(),
                    timeout: 60000,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `BytePlus GET ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private formatError(error: unknown): string {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as {
                response?: {
                    status?: number;
                    data?: {
                        error?: { message?: string; code?: string };
                        message?: string;
                    };
                };
                message?: string;
            };
            const data = axiosError.response?.data;
            const msg =
                data?.error?.message ??
                data?.message ??
                axiosError.message ??
                'BytePlus request failed';
            const status = axiosError.response?.status;
            const friendly = /web url|reference_video/i.test(msg)
                ? 'Seedance не принял видео-референс. Попробуйте другой файл (MP4/MOV) или позже.'
                : msg;
            return status ? `${friendly} (HTTP ${status})` : friendly;
        }
        if (error instanceof Error) {
            return error.message;
        }
        return 'BytePlus request failed';
    }
}
