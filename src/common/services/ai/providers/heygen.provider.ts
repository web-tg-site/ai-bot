import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    DEFAULT_HEYGEN_BACKGROUND_COLOR,
    DEFAULT_HEYGEN_BACKGROUND_MODE,
    DEFAULT_HEYGEN_ENGINE,
    DEFAULT_HEYGEN_EXPRESSIVENESS,
    DEFAULT_HEYGEN_VOICE_PITCH,
    DEFAULT_HEYGEN_VOICE_SPEED,
    type HeyGenAvatarLookOption,
    type HeyGenEngine,
    type HeyGenVoiceOption,
} from '@/common/config/heygen.config';
import {
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
    AiToolId,
} from '../types';

type HeyGenAvatarLookRaw = {
    id?: string;
    name?: string | null;
    preview_image_url?: string | null;
    preview_video_url?: string | null;
    gender?: string | null;
    default_voice_id?: string | null;
    supported_api_engines?: string[] | null;
};

type HeyGenVoiceRaw = {
    voice_id?: string;
    id?: string;
    name?: string | null;
    language?: string | null;
    gender?: string | null;
    preview_audio?: string | null;
    preview_url?: string | null;
    preview_audio_url?: string | null;
};

type HeyGenListResponse<T> = {
    data?: T[] | { voices?: T[]; looks?: T[]; items?: T[]; next_token?: string | null; has_more?: boolean };
    voices?: T[];
    next_token?: string | null;
    has_more?: boolean;
};

type ListCache<T> = {
    fetchedAt: number;
    items: T[];
};

@Injectable()
export class HeyGenProvider {
    private readonly apiKey: string;
    private readonly avatarIdOverride?: string;
    private readonly voiceIdOverride?: string;
    private readonly baseUrl = 'https://api.heygen.com';
    private readonly uploadUrl = 'https://upload.heygen.com';
    private readonly cacheTtlMs = 60 * 60 * 1000;

    private voicesCache: ListCache<HeyGenVoiceOption> | null = null;
    private looksCache: ListCache<HeyGenAvatarLookOption> | null = null;

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
        _toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const image = input.files?.find((file) =>
            file.mimeType.startsWith('image/'),
        );
        if (image) {
            return this.createImageJob(input, image);
        }
        return this.createAvatarJob(input);
    }

    async listPublicVoices(options?: {
        language?: string;
        gender?: string;
    }): Promise<HeyGenVoiceOption[]> {
        this.ensureApiKey();

        let voices = await this.getCachedVoices();
        if (options?.language) {
            const lang = options.language.toLowerCase();
            voices = voices.filter((voice) =>
                (voice.language ?? '').toLowerCase().includes(lang),
            );
        }
        if (options?.gender) {
            const gender = options.gender.toLowerCase();
            voices = voices.filter(
                (voice) => (voice.gender ?? '').toLowerCase() === gender,
            );
        }
        return voices;
    }

    async listPublicLooks(): Promise<HeyGenAvatarLookOption[]> {
        this.ensureApiKey();
        return this.getCachedLooks();
    }

    private async createAvatarJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (!input.prompt?.trim()) {
            throw new Error('Отправьте текст сценария для видео');
        }

        const { avatarId, defaultVoiceId } =
            await this.resolveAvatarLook(input);
        const voiceId = this.resolveVoiceId(input, defaultVoiceId);

        const body: Record<string, unknown> = {
            type: 'avatar',
            avatar_id: avatarId,
            script: input.prompt.trim(),
            title: this.buildVideoTitle(input.prompt),
            resolution: input.resolution ?? '720p',
            aspect_ratio: input.aspectRatio ?? '16:9',
            ...this.buildSharedVideoOptions(input),
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

    private async createImageJob(
        input: AiGenerationInput,
        image: NonNullable<AiGenerationInput['files']>[number],
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (!input.prompt?.trim()) {
            throw new Error(
                'Отправьте текст сценария в подписи к фото или отдельным сообщением',
            );
        }

        const assetId = await this.uploadImageAsset(
            image.buffer,
            image.mimeType,
        );
        const voiceId = this.resolveVoiceId(input, undefined);
        if (!voiceId) {
            throw new Error(
                'Выберите голос HeyGen для говорящего фото (Параметры → Голос)',
            );
        }

        const body: Record<string, unknown> = {
            type: 'image',
            image: { type: 'asset_id', asset_id: assetId },
            script: input.prompt.trim(),
            voice_id: voiceId,
            title: this.buildVideoTitle(input.prompt),
            resolution: input.resolution ?? '720p',
            aspect_ratio: input.aspectRatio ?? '16:9',
            ...this.buildSharedVideoOptions(input),
        };

        const response = await this.post<{ data: { video_id: string } }>(
            '/v3/videos',
            body,
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
                    response.data.failure_message ??
                    'Не удалось завершить генерацию — сбой на стороне провайдера.',
            };
        }

        return { status };
    }

    private buildSharedVideoOptions(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const options: Record<string, unknown> = {};

        const engine = input.heygenEngine ?? DEFAULT_HEYGEN_ENGINE;
        options.engine = { type: engine };

        if (input.heygenCaptions) {
            options.caption = { style: 'default' };
        }

        const backgroundMode =
            input.heygenBackgroundMode ?? DEFAULT_HEYGEN_BACKGROUND_MODE;
        if (backgroundMode === 'remove') {
            options.remove_background = true;
        } else if (backgroundMode === 'color') {
            options.background = {
                type: 'color',
                value:
                    input.heygenBackgroundColor ??
                    DEFAULT_HEYGEN_BACKGROUND_COLOR,
            };
        }

        const speed = input.heygenVoiceSpeed ?? DEFAULT_HEYGEN_VOICE_SPEED;
        const pitch = input.heygenVoicePitch ?? DEFAULT_HEYGEN_VOICE_PITCH;
        if (speed !== DEFAULT_HEYGEN_VOICE_SPEED || pitch !== 0) {
            options.voice_settings = {
                speed: this.clamp(speed, 0.5, 1.5),
                pitch: this.clamp(pitch, -50, 50),
            };
        }

        const motionPrompt = input.heygenMotionPrompt?.trim();
        if (motionPrompt) {
            options.motion_prompt = motionPrompt;
        }

        const expressiveness =
            input.heygenExpressiveness ?? DEFAULT_HEYGEN_EXPRESSIVENESS;
        if (expressiveness !== DEFAULT_HEYGEN_EXPRESSIVENESS) {
            options.expressiveness = expressiveness;
        }

        return options;
    }

    private resolveVoiceId(
        input: AiGenerationInput,
        defaultVoiceId?: string | null,
    ): string | undefined {
        return (
            input.heygenVoiceId?.trim() ||
            this.voiceIdOverride ||
            defaultVoiceId ||
            undefined
        );
    }

    private async resolveAvatarLook(input: AiGenerationInput): Promise<{
        avatarId: string;
        defaultVoiceId?: string | null;
    }> {
        const selectedId = input.heygenAvatarId?.trim();
        if (selectedId) {
            const looks = await this.getCachedLooks();
            const look = looks.find((item) => item.id === selectedId);
            return {
                avatarId: selectedId,
                defaultVoiceId: look?.defaultVoiceId,
            };
        }

        if (this.avatarIdOverride) {
            return {
                avatarId: this.avatarIdOverride,
                defaultVoiceId: this.voiceIdOverride,
            };
        }

        const looks = await this.getCachedLooks();
        const look = looks[0];
        if (!look?.id) {
            throw new Error(
                'Не найден публичный аватар. Обратитесь в поддержку.',
            );
        }

        return {
            avatarId: look.id,
            defaultVoiceId: look.defaultVoiceId,
        };
    }

    private async getCachedVoices(): Promise<HeyGenVoiceOption[]> {
        if (
            this.voicesCache &&
            Date.now() - this.voicesCache.fetchedAt < this.cacheTtlMs
        ) {
            return this.voicesCache.items;
        }

        const items = await this.fetchAllPublicVoices();
        this.voicesCache = { fetchedAt: Date.now(), items };
        return items;
    }

    private async getCachedLooks(): Promise<HeyGenAvatarLookOption[]> {
        if (
            this.looksCache &&
            Date.now() - this.looksCache.fetchedAt < this.cacheTtlMs
        ) {
            return this.looksCache.items;
        }

        const items = await this.fetchAllPublicLooks();
        this.looksCache = { fetchedAt: Date.now(), items };
        return items;
    }

    private async fetchAllPublicVoices(): Promise<HeyGenVoiceOption[]> {
        const items: HeyGenVoiceOption[] = [];
        let token: string | undefined;

        for (let page = 0; page < 5; page += 1) {
            const params = new URLSearchParams({
                type: 'public',
                limit: '100',
            });
            if (token) params.set('token', token);

            const response = await this.get<HeyGenListResponse<HeyGenVoiceRaw>>(
                `/v3/voices?${params.toString()}`,
            );
            const { items: pageItems, nextToken, hasMore } =
                this.unwrapListPage(response, 'voices');

            for (const raw of pageItems) {
                const mapped = this.mapVoice(raw);
                if (mapped) items.push(mapped);
            }

            if (!nextToken || hasMore === false) break;
            token = nextToken;
        }

        return items;
    }

    private async fetchAllPublicLooks(): Promise<HeyGenAvatarLookOption[]> {
        const items: HeyGenAvatarLookOption[] = [];
        let token: string | undefined;

        for (let page = 0; page < 5; page += 1) {
            const params = new URLSearchParams({
                ownership: 'public',
                limit: '100',
            });
            if (token) params.set('token', token);

            const response = await this.get<
                HeyGenListResponse<HeyGenAvatarLookRaw>
            >(`/v3/avatars/looks?${params.toString()}`);
            const { items: pageItems, nextToken, hasMore } =
                this.unwrapListPage(response, 'looks');

            for (const raw of pageItems) {
                const mapped = this.mapLook(raw);
                if (mapped) items.push(mapped);
            }

            if (!nextToken || hasMore === false) break;
            token = nextToken;
        }

        return items;
    }

    private unwrapListPage<T>(
        response: HeyGenListResponse<T>,
        nestedKey: 'voices' | 'looks',
    ): {
        items: T[];
        nextToken?: string;
        hasMore?: boolean;
    } {
        const data = response.data;

        if (Array.isArray(data)) {
            return {
                items: data,
                nextToken: response.next_token ?? undefined,
                hasMore: response.has_more,
            };
        }

        if (data && typeof data === 'object') {
            const nested =
                nestedKey === 'voices'
                    ? (data.voices ?? data.items ?? [])
                    : (data.looks ?? data.items ?? []);
            return {
                items: nested,
                nextToken:
                    data.next_token ?? response.next_token ?? undefined,
                hasMore: data.has_more ?? response.has_more,
            };
        }

        return {
            items: response.voices ?? [],
            nextToken: response.next_token ?? undefined,
            hasMore: response.has_more,
        };
    }

    private mapVoice(raw: HeyGenVoiceRaw): HeyGenVoiceOption | null {
        const id = raw.voice_id ?? raw.id;
        if (!id) return null;
        return {
            id,
            name: raw.name?.trim() || id,
            language: raw.language ?? null,
            gender: raw.gender ?? null,
            previewUrl:
                raw.preview_audio_url ??
                raw.preview_audio ??
                raw.preview_url ??
                null,
        };
    }

    private mapLook(raw: HeyGenAvatarLookRaw): HeyGenAvatarLookOption | null {
        if (!raw.id) return null;
        const engines = (raw.supported_api_engines ?? [])
            .map((value) => value as HeyGenEngine)
            .filter((value): value is HeyGenEngine =>
                ['avatar_iii', 'avatar_iv', 'avatar_v'].includes(value),
            );
        return {
            id: raw.id,
            name: raw.name?.trim() || raw.id,
            previewImageUrl: raw.preview_image_url ?? null,
            previewVideoUrl: raw.preview_video_url ?? null,
            gender: raw.gender ?? null,
            defaultVoiceId: raw.default_voice_id ?? null,
            supportedEngines: engines,
        };
    }

    private async uploadImageAsset(
        buffer: Buffer,
        mimeType: string,
    ): Promise<string> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<{
                    data?: {
                        image_key?: string;
                        id?: string;
                        asset_id?: string;
                    };
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

            const assetId =
                response.data?.data?.asset_id ??
                response.data?.data?.id ??
                response.data?.data?.image_key;
            if (!assetId) {
                throw new Error('HeyGen did not return asset id after upload');
            }

            return assetId;
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

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
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
                return `Сбой на стороне провайдера (HTTP ${axiosError.response.status}).`;
            }
        }

        return error instanceof Error
            ? error.message
            : 'Сбой на стороне провайдера';
    }
}
