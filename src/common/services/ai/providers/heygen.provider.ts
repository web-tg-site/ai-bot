import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
    AiToolId,
} from '../types';

type HeyGenAvatarLook = {
    id: string;
    default_voice_id?: string | null;
};

@Injectable()
export class HeyGenProvider {
    private readonly apiKey: string;
    private readonly avatarIdOverride?: string;
    private readonly voiceIdOverride?: string;
    private readonly baseUrl = 'https://api.heygen.com';
    private readonly uploadUrl = 'https://upload.heygen.com';
    private readonly defaultPhotoAvatarVoiceId =
        '37832e32d4f7475ab7a1cb0db8e5dd66';

    private cachedAvatarLook?: HeyGenAvatarLook;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(HeyGenProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('HEYGEN_API_KEY') ?? '';
        this.avatarIdOverride = configService.get<string>('HEYGEN_AVATAR_ID');
        this.voiceIdOverride = configService.get<string>('HEYGEN_VOICE_ID');
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        if (toolId === AiToolId.VIDEO_TO_AUDIO) {
            return this.createPhotoAvatarJob(input);
        }

        return this.createAvatarJob(input);
    }

    private async createAvatarJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (!input.prompt?.trim()) {
            throw new Error('Отправьте текст сценария для видео');
        }

        const { avatarId, voiceId } = await this.resolveAvatarLook();

        const body: Record<string, unknown> = {
            type: 'avatar',
            avatar_id: avatarId,
            script: input.prompt.trim(),
            resolution: '720p',
            aspect_ratio: '16:9',
        };

        if (voiceId) {
            body.voice_id = voiceId;
        }

        const response = await this.post<{ data: { video_id: string } }>(
            '/v3/videos',
            body,
        );

        return {
            providerJobId: response.data.video_id,
            estimatedTokenCost: 0,
        };
    }

    private async createPhotoAvatarJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        const image = input.files?.find((file) =>
            file.mimeType.startsWith('image/'),
        );
        if (!image) {
            throw new Error(
                'Отправьте фото (портрет) для генерации говорящего видео',
            );
        }

        if (!input.prompt?.trim()) {
            throw new Error(
                'Отправьте текст сценария в подписи к фото или отдельным сообщением',
            );
        }

        const imageKey = await this.uploadImageAsset(
            image.buffer,
            image.mimeType,
        );
        const script = input.prompt.trim();
        const voiceId = this.voiceIdOverride ?? this.defaultPhotoAvatarVoiceId;

        const response = await this.post<{ data: { video_id: string } }>(
            '/v2/video/av4/generate',
            {
                image_key: imageKey,
                video_title: this.buildVideoTitle(script),
                script,
                voice_id: voiceId,
                video_orientation: 'portrait',
            },
        );

        return {
            providerJobId: response.data.video_id,
            estimatedTokenCost: 0,
        };
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        const response = await this.get<{
            data: {
                status: string;
                video_url?: string;
                failure_message?: string;
            };
        }>(`/v3/videos/${providerJobId}`);

        const status = this.mapStatus(response.data.status);

        if (status === 'completed' && response.data.video_url) {
            return {
                status,
                result: { type: 'video', url: response.data.video_url },
            };
        }

        if (status === 'failed') {
            return {
                status,
                errorMessage:
                    response.data.failure_message ?? 'HeyGen generation failed',
            };
        }

        return { status };
    }

    private async resolveAvatarLook(): Promise<{
        avatarId: string;
        voiceId?: string;
    }> {
        if (this.avatarIdOverride) {
            return {
                avatarId: this.avatarIdOverride,
                voiceId: this.voiceIdOverride,
            };
        }

        if (this.cachedAvatarLook) {
            return {
                avatarId: this.cachedAvatarLook.id,
                voiceId:
                    this.voiceIdOverride ??
                    this.cachedAvatarLook.default_voice_id ??
                    undefined,
            };
        }

        const response = await this.get<{
            data: HeyGenAvatarLook[];
        }>('/v3/avatars/looks?ownership=public&limit=1');

        const look = response.data[0];
        if (!look?.id) {
            throw new Error(
                'Не найден публичный аватар HeyGen. Укажите HEYGEN_AVATAR_ID в .env',
            );
        }

        this.cachedAvatarLook = look;

        return {
            avatarId: look.id,
            voiceId: this.voiceIdOverride ?? look.default_voice_id ?? undefined,
        };
    }

    private async uploadImageAsset(
        buffer: Buffer,
        mimeType: string,
    ): Promise<string> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<{
                    data?: { image_key?: string };
                }>(`${this.uploadUrl}/v1/asset`, buffer, {
                    headers: {
                        'X-Api-Key': this.apiKey,
                        'Content-Type': mimeType || 'image/jpeg',
                    },
                    timeout: 120000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }),
            );

            const imageKey = response.data?.data?.image_key;
            if (!imageKey) {
                throw new Error('HeyGen did not return image_key after upload');
            }

            return imageKey;
        } catch (error) {
            const message = this.formatError(error);
            this.logger.error(`HeyGen asset upload failed: ${message}`);
            throw new Error(message);
        }
    }

    private buildVideoTitle(script: string): string {
        const normalized = script.replace(/\s+/g, ' ').trim();
        if (normalized.length <= 80) {
            return normalized;
        }

        return `${normalized.slice(0, 77)}...`;
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('HEYGEN_API_KEY is not configured');
        }
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (['completed', 'success', 'done'].includes(normalized))
            return 'completed';
        if (['failed', 'error'].includes(normalized)) return 'failed';
        if (['processing', 'pending', 'waiting'].includes(normalized))
            return 'processing';
        return 'pending';
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, data, {
                    headers: this.getHeaders(),
                    timeout: 60000,
                }),
            );
            return response.data;
        } catch (error) {
            const message = this.formatError(error);
            this.logger.error(`HeyGen POST ${path} failed: ${message}`);
            throw new Error(message);
        }
    }

    private async get<T>(path: string): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<T>(`${this.baseUrl}${path}`, {
                    headers: this.getHeaders(),
                    timeout: 30000,
                }),
            );
            return response.data;
        } catch (error) {
            const message = this.formatError(error);
            this.logger.error(`HeyGen GET ${path} failed: ${message}`);
            throw new Error(message);
        }
    }

    private getHeaders() {
        return {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json',
        };
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
            };

            const apiError = axiosError.response?.data?.error;
            if (apiError?.message) {
                return apiError.code
                    ? `${apiError.message} (${apiError.code})`
                    : apiError.message;
            }

            if (axiosError.response?.data?.message) {
                return axiosError.response.data.message;
            }

            if (axiosError.response?.status) {
                return `HeyGen API error: HTTP ${axiosError.response.status}`;
            }
        }

        return error instanceof Error ? error.message : 'HeyGen API error';
    }
}
