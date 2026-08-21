import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
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

const DEFAULT_BYTEPLUS_API_URL =
    'https://ark.ap-southeast.bytepluses.com/api/v3';
const SEEDANCE_25_MODEL = 'dreamina-seedance-2-5-260628';

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

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
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
        const body = this.buildSeedanceBody(model, input);

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
                response.error?.message ??
                    'BytePlus did not return task id',
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
                    errorMessage:
                        'BytePlus завершил задачу без URL видео',
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

    private buildSeedanceBody(
        model: string,
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const { images, videos, audios } = splitMediaFiles(input.files);
        this.validateMediaCounts(images, videos, audios);
        this.validateFileSizes([...images, ...videos, ...audios]);

        const mode = this.resolveMode(input, images, videos);
        const prompt = this.resolvePrompt(input, mode, images, videos, audios);
        const content = this.buildContent(
            prompt,
            mode,
            images,
            videos,
            audios,
        );

        const resolution =
            input.resolution === '480p' ? '480p' : '720p';

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
        if (videos.length === 0 && images.length >= 1 && images.length <= 2) {
            return 'first_last';
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

    private buildAssetManifest(
        images: AiFileInput[],
        videos: AiFileInput[],
        audios: AiFileInput[],
    ): string {
        const lines: string[] = [];
        images.forEach((_, i) => {
            lines.push(
                `Image ${i + 1}: visual reference (appearance / scene / style).`,
            );
        });
        videos.forEach((_, i) => {
            lines.push(
                `Video ${i + 1}: motion / timing / scene reference.`,
            );
        });
        audios.forEach((_, i) => {
            lines.push(
                `Audio ${i + 1}: voice / ambience / music reference.`,
            );
        });
        return lines.join('\n');
    }

    private buildContent(
        prompt: string,
        mode: SeedanceMode,
        images: AiFileInput[],
        videos: AiFileInput[],
        audios: AiFileInput[],
    ): BytePlusContentItem[] {
        const content: BytePlusContentItem[] = [
            { type: 'text', text: prompt },
        ];

        if (mode === 'first_last') {
            content.push({
                type: 'image_url',
                image_url: { url: this.toDataUrl(images[0]) },
                role: 'first_frame',
            });
            if (images[1]) {
                content.push({
                    type: 'image_url',
                    image_url: { url: this.toDataUrl(images[1]) },
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
            content.push({
                type: 'video_url',
                video_url: { url: this.toDataUrl(video) },
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
            return status ? `${msg} (HTTP ${status})` : msg;
        }
        if (error instanceof Error) {
            return error.message;
        }
        return 'BytePlus request failed';
    }
}
