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
import {
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
} from '../types';

const PLATFORM_JOB_PREFIX = 'hfplat:';
const CLOUD_BASE_URL = 'https://cloud.higgsfield.ai/api/v1';
const PLATFORM_BASE_URL = 'https://platform.higgsfield.ai';

@Injectable()
export class HiggsfieldProvider {
    private readonly cloudApiKey: string;
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

        this.cloudApiKey =
            configService.get<string>('HIGGSFIELD_API_KEY')?.trim() ?? '';
        this.platformApiKey =
            credKey ||
            configService.get<string>('HIGGSFIELD_KEY_ID')?.trim() ||
            this.cloudApiKey;
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

        const fromCloud = await this.fetchCloudMotions();
        if (fromCloud.length) {
            this.motionsCache = {
                fetchedAt: Date.now(),
                motions: fromCloud,
            };
            return fromCloud;
        }

        return HIGGSFIELD_CURATED_MOTION_NAMES.map((name) => ({
            id: `name:${name}`,
            name,
            category: null,
            previewUrl: null,
        }));
    }

    async createJob(input: AiGenerationInput): Promise<AiJobCreateResult> {
        const motionId = this.normalizeMotionId(input.higgsfieldMotionId);
        const strength =
            input.higgsfieldMotionStrength ?? DEFAULT_HIGGSFIELD_MOTION_STRENGTH;

        if (motionId) {
            const imageFile = input.files?.find((file) =>
                file.mimeType.startsWith('image/'),
            );
            if (!imageFile) {
                throw new Error(
                    'Для эффекта Higgsfield нужен фото-референс. Загрузите изображение и повторите.',
                );
            }

            const resolvedMotionId = await this.resolveMotionId(motionId);

            if (this.hasPlatformCredentials()) {
                return this.createPlatformDopJob(
                    input,
                    imageFile,
                    resolvedMotionId,
                    strength,
                );
            }

            return this.createCloudJob(input, {
                motionId: resolvedMotionId,
                strength,
            });
        }

        this.ensureCloudApiKey();
        return this.createCloudJob(input);
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        if (providerJobId.startsWith(PLATFORM_JOB_PREFIX)) {
            return this.getPlatformJobStatus(
                providerJobId.slice(PLATFORM_JOB_PREFIX.length),
            );
        }

        this.ensureCloudApiKey();
        const response = await this.cloudGet<{
            status: string;
            output_url?: string;
            error?: string;
        }>(`/generations/${providerJobId}`);

        const status = this.mapStatus(response.status);

        if (status === 'completed' && response.output_url) {
            return {
                status,
                result: { type: 'video', url: response.output_url },
            };
        }

        if (status === 'failed') {
            return {
                status,
                errorMessage:
                    response.error ??
                    'Не удалось завершить генерацию — сбой на стороне провайдера.',
            };
        }

        return { status };
    }

    private async createCloudJob(
        input: AiGenerationInput,
        motion?: { motionId: string; strength: number },
    ): Promise<AiJobCreateResult> {
        this.ensureCloudApiKey();

        const body: Record<string, unknown> = {
            prompt: input.prompt,
            duration: input.durationSeconds ?? 5,
            resolution: input.resolution ?? '720p',
            image: input.files?.[0]
                ? `data:${input.files[0].mimeType};base64,${input.files[0].buffer.toString('base64')}`
                : undefined,
        };

        if (motion) {
            body.motion_id = motion.motionId;
            body.motion_strength = motion.strength;
            body.motions = [
                { id: motion.motionId, strength: motion.strength },
            ];
        }

        try {
            const response = await this.cloudPost<{ id: string }>(
                '/generations/video',
                body,
            );
            return {
                providerJobId: response.id,
                estimatedTokenCost: 0,
            };
        } catch (error) {
            if (motion && this.hasPlatformCredentials()) {
                this.logger.warn(
                    {
                        err:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    'Cloud Higgsfield rejected motion params, falling back to platform DoP',
                );
                const imageFile = input.files?.find((file) =>
                    file.mimeType.startsWith('image/'),
                );
                if (!imageFile) {
                    throw error;
                }
                return this.createPlatformDopJob(
                    input,
                    imageFile,
                    motion.motionId,
                    motion.strength,
                );
            }
            if (motion && !this.hasPlatformCredentials()) {
                throw new Error(
                    'Эффекты Higgsfield требуют platform API (HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET или HIGGSFIELD_CREDENTIALS). Cloud endpoint не принял motion.',
                );
            }
            throw error;
        }
    }

    private async createPlatformDopJob(
        input: AiGenerationInput,
        imageFile: NonNullable<AiGenerationInput['files']>[number],
        motionId: string,
        strength: number,
    ): Promise<AiJobCreateResult> {
        this.ensurePlatformCredentials();

        const imageUrl = await this.uploadPlatformImage(imageFile);
        const response = await this.platformPost<{
            request_id?: string;
            id?: string;
            status?: string;
        }>('/v1/image2video/dop', {
            model: 'dop-turbo',
            prompt: input.prompt ?? '',
            input_images: [{ type: 'image_url', image_url: imageUrl }],
            motions: [{ id: motionId, strength }],
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

    private async getPlatformJobStatus(
        requestId: string,
    ): Promise<AiJobStatusResult> {
        this.ensurePlatformCredentials();
        const response = await this.platformGet<{
            status: string;
            video?: { url?: string };
            error?: string;
            detail?: string;
        }>(`/requests/${requestId}/status`);

        const status = this.mapStatus(response.status);

        if (status === 'completed' && response.video?.url) {
            return {
                status,
                result: { type: 'video', url: response.video.url },
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
        }>('/files/generate-upload-url', { content_type: contentType });

        await firstValueFrom(
            this.httpService.put(link.upload_url, file.buffer, {
                headers: { 'Content-Type': contentType },
                timeout: 60000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            }),
        );

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

    private async fetchCloudMotions(): Promise<HiggsfieldMotionOption[]> {
        if (!this.cloudApiKey) {
            return [];
        }

        for (const path of ['/motions', '/generations/motions']) {
            try {
                const response = await this.cloudGet<unknown>(path);
                const motions = this.normalizeMotionList(response);
                if (motions.length) {
                    return motions;
                }
            } catch {
                /* try next path */
            }
        }

        return [];
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

    private ensureCloudApiKey() {
        if (!this.cloudApiKey) {
            throw new Error('HIGGSFIELD_API_KEY is not configured');
        }
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

    private cloudHeaders() {
        return {
            Authorization: `Bearer ${this.cloudApiKey}`,
            'Content-Type': 'application/json',
        };
    }

    private platformHeaders() {
        return {
            Authorization: `Key ${this.platformApiKey}:${this.platformApiSecret}`,
            'Content-Type': 'application/json',
            'hf-api-key': this.platformApiKey,
            'hf-secret': this.platformApiSecret,
        };
    }

    private async cloudPost<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${CLOUD_BASE_URL}${path}`, data, {
                    headers: this.cloudHeaders(),
                    timeout: 60000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `Higgsfield cloud POST ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private async cloudGet<T>(path: string): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<T>(`${CLOUD_BASE_URL}${path}`, {
                    headers: this.cloudHeaders(),
                    timeout: 30000,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `Higgsfield cloud GET ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
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
                    data?: {
                        message?: string;
                        detail?: string | { msg?: string };
                        error?: string;
                    };
                };
            };
            const data = axiosError.response?.data;
            if (typeof data?.message === 'string') return data.message;
            if (typeof data?.error === 'string') return data.error;
            if (typeof data?.detail === 'string') return data.detail;
            if (
                data?.detail &&
                typeof data.detail === 'object' &&
                typeof data.detail.msg === 'string'
            ) {
                return data.detail.msg;
            }
            return 'Сбой на стороне провайдера';
        }
        return error instanceof Error
            ? error.message
            : 'Сбой на стороне провайдера';
    }
}
