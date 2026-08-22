import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    DEFAULT_HIGGSFIELD_MOTION_STRENGTH,
    HIGGSFIELD_CURATED_MOTION_NAMES,
    HIGGSFIELD_NO_MOTION_ID,
    type HiggsfieldMotionOption,
} from '@/common/config/higgsfield-motions.config';
import { downloadRemoteFile } from '@/common/utils/download-remote-file';
import {
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
} from '../types';

const PLATFORM_JOB_PREFIX = 'hfplat:';
const PLATFORM_BASE_URL = 'https://platform.higgsfield.ai';

type DopVariant = 'standard' | 'turbo';

@Injectable()
export class HiggsfieldProvider {
    private readonly platformApiKey: string;
    private readonly platformApiSecret: string;
    private motionsCache: {
        fetchedAt: number;
        motions: HiggsfieldMotionOption[];
    } | null = null;
    private readonly motionsCacheTtlMs = 30 * 60 * 1000;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(HiggsfieldProvider.name)
        private readonly logger: PinoLogger,
    ) {
        const credentials =
            configService.get<string>('HIGGSFIELD_CREDENTIALS')?.trim() ?? '';
        const [credKey, credSecret] = credentials.includes(':')
            ? credentials.split(':', 2)
            : ['', ''];

        this.platformApiKey =
            credKey ||
            configService.get<string>('HIGGSFIELD_KEY_ID')?.trim() ||
            configService.get<string>('HIGGSFIELD_API_KEY')?.trim() ||
            '';
        this.platformApiSecret =
            credSecret ||
            configService.get<string>('HIGGSFIELD_API_SECRET')?.trim() ||
            '';
    }

    async listMotions(): Promise<HiggsfieldMotionOption[]> {
        if (
            this.motionsCache &&
            Date.now() - this.motionsCache.fetchedAt < this.motionsCacheTtlMs
        ) {
            return this.motionsCache.motions;
        }

        const fromPlatform = await this.fetchPlatformMotions();
        if (fromPlatform.length) {
            this.motionsCache = {
                fetchedAt: Date.now(),
                motions: fromPlatform,
            };
            return fromPlatform;
        }

        return HIGGSFIELD_CURATED_MOTION_NAMES.map((name) => ({
            id: `name:${name}`,
            name,
            category: null,
            previewUrl: null,
        }));
    }

    async createJob(input: AiGenerationInput): Promise<AiJobCreateResult> {
        this.ensurePlatformCredentials();

        const imageFile = input.files?.find((file) =>
            file.mimeType.startsWith('image/'),
        );
        const motionId = this.normalizeMotionId(input.higgsfieldMotionId);
        const strength =
            input.higgsfieldMotionStrength ?? DEFAULT_HIGGSFIELD_MOTION_STRENGTH;

        if (motionId) {
            if (!imageFile) {
                throw new Error(
                    'Для эффекта Higgsfield нужен фото-референс. Загрузите изображение и повторите.',
                );
            }

            const resolvedMotionId = await this.resolveMotionId(motionId);
            return this.createPlatformDopJob(
                input,
                imageFile,
                [{ id: resolvedMotionId, strength }],
                'turbo',
            );
        }

        if (imageFile) {
            return this.createPlatformDopJob(input, imageFile, [], 'standard');
        }

        if (!input.prompt?.trim()) {
            throw new Error('Отправьте текстовый промпт для генерации видео');
        }

        return this.createPlatformTextToVideoJob(input);
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        const requestId = providerJobId.startsWith(PLATFORM_JOB_PREFIX)
            ? providerJobId.slice(PLATFORM_JOB_PREFIX.length)
            : providerJobId;

        return this.getPlatformJobStatus(requestId);
    }

    async fetchResultMedia(
        providerJobId: string,
    ): Promise<{ buffer: Buffer; mimeType: string } | null> {
        const status = await this.getJobStatus(providerJobId);
        const url = status.result?.url;
        if (status.status !== 'completed' || !url) {
            return null;
        }

        try {
            const { buffer, mimeType } = await downloadRemoteFile(url);
            return {
                buffer,
                mimeType: status.result?.mimeType ?? mimeType ?? 'video/mp4',
            };
        } catch (error) {
            this.logger.warn(
                {
                    providerJobId,
                    err: error instanceof Error ? error.message : String(error),
                },
                'Failed to download Higgsfield result media',
            );
            return null;
        }
    }

    private async createPlatformDopJob(
        input: AiGenerationInput,
        imageFile: NonNullable<AiGenerationInput['files']>[number],
        motions: Array<{ id: string; strength: number }>,
        variant: DopVariant,
    ): Promise<AiJobCreateResult> {
        this.ensurePlatformCredentials();

        const imageUrl = await this.uploadPlatformImage(imageFile);
        const endImageFile = input.files?.find(
            (file, index) =>
                index > 0 &&
                file !== imageFile &&
                file.mimeType.startsWith('image/'),
        );
        const endImageUrl = endImageFile
            ? await this.uploadPlatformImage(endImageFile)
            : undefined;

        const response = await this.platformPost<{
            request_id?: string;
            id?: string;
            status?: string;
        }>(`/higgsfield-ai/dop/${variant}`, {
            prompt: input.prompt ?? '',
            image_url: imageUrl,
            ...(endImageUrl ? { end_image_url: endImageUrl } : {}),
            ...(motions.length ? { motions } : {}),
            enhance_prompt: true,
        });

        const requestId = response.request_id ?? response.id;
        if (!requestId) {
            throw new Error('Higgsfield platform did not return request_id');
        }

        return {
            providerJobId: `${PLATFORM_JOB_PREFIX}${requestId}`,
            estimatedTokenCost: 0,
        };
    }

    private async createPlatformTextToVideoJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensurePlatformCredentials();

        const response = await this.platformPost<{
            request_id?: string;
            id?: string;
        }>('/wan-25-preview/text-to-video', {
            prompt: input.prompt!.trim(),
            duration: this.resolveTextToVideoDuration(input.durationSeconds),
            resolution: this.resolveTextToVideoResolution(input.resolution),
        });

        const requestId = response.request_id ?? response.id;
        if (!requestId) {
            throw new Error('Higgsfield platform did not return request_id');
        }

        return {
            providerJobId: `${PLATFORM_JOB_PREFIX}${requestId}`,
            estimatedTokenCost: 0,
        };
    }

    private resolveTextToVideoDuration(durationSeconds?: number): 5 | 10 {
        return (durationSeconds ?? 5) >= 10 ? 10 : 5;
    }

    private resolveTextToVideoResolution(
        resolution?: string,
    ): '480p' | '720p' | '1080p' {
        if (resolution === '480p' || resolution === '1080p') {
            return resolution;
        }
        return '720p';
    }

    private async getPlatformJobStatus(
        requestId: string,
    ): Promise<AiJobStatusResult> {
        this.ensurePlatformCredentials();
        const response = await this.platformGet<{
            status: string;
            video?: { url?: string };
            error?: string | null;
            detail?: string;
        }>(`/requests/${requestId}/status`);

        const status = this.mapStatus(response.status);

        if (status === 'completed') {
            const videoUrl = response.video?.url;
            if (videoUrl) {
                return {
                    status,
                    result: { type: 'video', url: videoUrl },
                };
            }

            this.logger.warn(
                { requestId, taskStatus: response.status },
                'Higgsfield task completed without video URL',
            );
            return {
                status: 'failed',
                errorMessage:
                    'Higgsfield завершил задачу без видео. Попробуйте ещё раз.',
            };
        }

        if (status === 'failed') {
            return {
                status,
                errorMessage:
                    response.error ??
                    response.detail ??
                    'Не удалось завершить генерацию — сбой на стороне провайдера.',
            };
        }

        return { status };
    }

    private async uploadPlatformImage(
        file: NonNullable<AiGenerationInput['files']>[number],
    ): Promise<string> {
        const contentType = file.mimeType || 'image/jpeg';
        const link = await this.platformPost<{
            upload_url: string;
            public_url: string;
            content_type?: string;
            upload_headers?: Record<string, string>;
        }>('/files/generate-upload-url', { content_type: contentType });

        const uploadContentType = link.content_type || contentType;
        try {
            await firstValueFrom(
                this.httpService.put(link.upload_url, file.buffer, {
                    headers: {
                        ...(link.upload_headers ?? {}),
                        'Content-Type': uploadContentType,
                    },
                    timeout: 60000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }),
            );
        } catch (error) {
            this.logger.error(
                `Higgsfield platform image upload failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }

        return link.public_url;
    }

    private async fetchPlatformMotions(): Promise<HiggsfieldMotionOption[]> {
        if (!this.hasPlatformCredentials()) {
            return [];
        }

        try {
            const response = await this.platformGet<
                | HiggsfieldMotionOption[]
                | { motions?: Array<Record<string, unknown>> }
            >('/v1/motions');
            return this.normalizeMotionList(response);
        } catch (error) {
            this.logger.warn(
                {
                    err: error instanceof Error ? error.message : String(error),
                },
                'Failed to fetch Higgsfield platform motions',
            );
            return [];
        }
    }

    private normalizeMotionList(raw: unknown): HiggsfieldMotionOption[] {
        const list = Array.isArray(raw)
            ? raw
            : raw && typeof raw === 'object' && 'motions' in raw
              ? ((raw as { motions?: unknown[] }).motions ?? [])
              : [];

        return list
            .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const row = item as Record<string, unknown>;
                const id = String(row.id ?? row.motion_id ?? '').trim();
                const name = String(row.name ?? row.title ?? '').trim();
                if (!id || !name) return null;
                const option: HiggsfieldMotionOption = {
                    id,
                    name,
                    category:
                        typeof row.category === 'string' ? row.category : null,
                    previewUrl:
                        typeof row.preview_url === 'string'
                            ? row.preview_url
                            : typeof row.previewUrl === 'string'
                              ? row.previewUrl
                              : null,
                };
                return option;
            })
            .filter((item): item is HiggsfieldMotionOption => item != null)
            .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    }

    private normalizeMotionId(motionId?: string): string | undefined {
        const trimmed = motionId?.trim();
        if (!trimmed || trimmed === HIGGSFIELD_NO_MOTION_ID) {
            return undefined;
        }
        return trimmed;
    }

    private async resolveMotionId(motionId: string): Promise<string> {
        if (motionId.startsWith('name:')) {
            const name = motionId.slice('name:'.length).trim().toLowerCase();
            const motions = await this.listMotions();
            const match = motions.find(
                (motion) => motion.name.trim().toLowerCase() === name,
            );
            if (!match || match.id.startsWith('name:')) {
                throw new Error(
                    `Эффект «${motionId.slice('name:'.length)}» недоступен в API Higgsfield. Проверьте platform credentials.`,
                );
            }
            return match.id;
        }
        return motionId;
    }

    private hasPlatformCredentials(): boolean {
        return Boolean(this.platformApiKey && this.platformApiSecret);
    }

    private ensurePlatformCredentials() {
        if (!this.hasPlatformCredentials()) {
            throw new Error(
                'Higgsfield platform credentials are not configured (HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET or HIGGSFIELD_CREDENTIALS)',
            );
        }
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (['completed', 'success', 'done'].includes(normalized)) {
            return 'completed';
        }
        if (['failed', 'error', 'nsfw'].includes(normalized)) {
            return 'failed';
        }
        if (
            ['processing', 'running', 'in_progress', 'in-progress'].includes(
                normalized,
            )
        ) {
            return 'processing';
        }
        return 'pending';
    }

    private platformHeaders() {
        return {
            Authorization: `Key ${this.platformApiKey}:${this.platformApiSecret}`,
            'Content-Type': 'application/json',
            'hf-api-key': this.platformApiKey,
            'hf-secret': this.platformApiSecret,
        };
    }

    private async platformPost<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${PLATFORM_BASE_URL}${path}`, data, {
                    headers: this.platformHeaders(),
                    timeout: 60000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `Higgsfield platform POST ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private async platformGet<T>(path: string): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<T>(`${PLATFORM_BASE_URL}${path}`, {
                    headers: this.platformHeaders(),
                    timeout: 30000,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `Higgsfield platform GET ${path} failed: ${this.formatError(error)}`,
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
                        message?: string;
                        detail?: string | { msg?: string } | Array<{ msg?: string }>;
                        error?: string;
                    };
                };
            };
            const status = axiosError.response?.status;
            const data = axiosError.response?.data;
            if (typeof data?.message === 'string') return data.message;
            if (typeof data?.error === 'string') return data.error;
            if (typeof data?.detail === 'string') return data.detail;
            if (Array.isArray(data?.detail)) {
                const messages = data.detail
                    .map((item) => item?.msg)
                    .filter((msg): msg is string => typeof msg === 'string');
                if (messages.length) return messages.join('; ');
            }
            if (
                data?.detail &&
                typeof data.detail === 'object' &&
                !Array.isArray(data.detail) &&
                typeof data.detail.msg === 'string'
            ) {
                return data.detail.msg;
            }
            if (status === 401 || status === 403) {
                return `Higgsfield отклонил ключи (HTTP ${status}). Проверьте HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET на cloud.higgsfield.ai`;
            }
            return status
                ? `Сбой Higgsfield (HTTP ${status})`
                : 'Сбой на стороне провайдера';
        }
        return error instanceof Error
            ? error.message
            : 'Сбой на стороне провайдера';
    }
}
