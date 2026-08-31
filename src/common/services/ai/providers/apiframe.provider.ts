import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { getToolById } from '@/common/config/ai-tools.registry';
import {
    buildSunoStyleTags,
    hasSunoGenerationSeed,
} from '@/common/config/suno-audio.config';
import {
    ApiframeAction,
    ApiframeResultJson,
    ApiframeTrack,
    DEFAULT_SUNO_MODEL_VERSION,
    eligibleActionsForKind,
    SUNO_MODEL_VERSIONS,
    type SunoModelVersion,
} from '@/common/config/apiframe.config';
import { midjourneyQualityToQParam } from '@/common/config/image-editor-capabilities.config';
import {
    AiGenerationInput,
    AiGenerationResult,
    AiJobCreateResult,
    AiJobStatusResult,
    AiProviderId,
    AiToolId,
} from '../types';

type ApiframeSubmitResponse = {
    jobId?: string;
    status?: string;
};

type ApiframeJobResponse = {
    id?: string;
    jobId?: string;
    status?: string;
    result?: {
        images?: string[];
        gridUrl?: string;
        tracks?: Array<{
            id?: string;
            audioUrl?: string;
            imageUrl?: string | null;
            title?: string | null;
            tags?: string | null;
            duration?: number | null;
        }>;
    };
    error?: { message?: string; code?: string } | string;
    message?: string;
};

export function stripApiframeErrorMessage(message: string): string {
    return message.split('\n\nID запроса:')[0].trim();
}

export function isApiframeMidjourneyUpstreamError(message: string): boolean {
    const base = stripApiframeErrorMessage(message);
    return /provider_error|provider unavailable|provider_timeout|Insufficient credits|upstream|Image generation failed|Сбой на стороне провайдера/i.test(
        base,
    );
}

export function isApiframeMidjourneyGenericFailure(message: string): boolean {
    const base = stripApiframeErrorMessage(message);
    return (
        base === 'Generation failed' ||
        /Генерация завершилась без результата/i.test(base) ||
        base === 'Apiframe generation failed' ||
        /Apiframe завершил задачу без результата/i.test(base)
    );
}

@Injectable()
export class ApiframeProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(ApiframeProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('APIFRAME_API_KEY') ?? '';
        this.baseUrl =
            configService.get<string>('APIFRAME_API_URL') ??
            'https://api.apiframe.ai';
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (input.apiframeAction) {
            return this.createActionJob(toolId, input);
        }

        if (toolId === AiToolId.MIDJOURNEY) {
            return this.createMidjourneyJob(input);
        }

        if (toolId === AiToolId.SUNO) {
            return this.createSunoJob(input);
        }

        throw new Error(`Apiframe does not support tool ${toolId}`);
    }

    async getJobStatus(
        providerJobId: string,
        toolId: AiToolId,
    ): Promise<AiJobStatusResult> {
        this.ensureApiKey();

        const job = await this.get<ApiframeJobResponse>(
            `/v2/jobs/${providerJobId}`,
        );
        const status = this.mapStatus(job.status);

        if (status === 'completed') {
            const mapped = this.mapCompletedResult(toolId, job);
            if (!mapped) {
                this.logger.warn(
                    { providerJobId, toolId, result: job.result },
                    'Apiframe job completed without usable result',
                );
                return {
                    status: 'failed',
                    errorMessage: this.formatError(
                        'Генерация завершилась без результата',
                    ),
                };
            }
            return { status, result: mapped };
        }

        if (status === 'failed') {
            const raw =
                typeof job.error === 'string'
                    ? job.error
                    : (job.error?.message ??
                      job.message ??
                      'Generation failed');
            return {
                status: 'failed',
                errorMessage: this.formatError(raw),
            };
        }

        return { status };
    }

    async generate(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const { providerJobId } = await this.createJob(toolId, input);
        const maxAttempts = 90;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise((r) =>
                setTimeout(r, attempt < 10 ? 3000 : 10_000),
            );
            const status = await this.getJobStatus(providerJobId, toolId);
            if (status.status === 'completed' && status.result) {
                return status.result;
            }
            if (status.status === 'failed') {
                throw new Error(
                    status.errorMessage ?? 'Generation failed',
                );
            }
        }

        throw new Error('Generation timed out');
    }

    private async createMidjourneyJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const rawPrompt = input.prompt?.trim();
        if (!rawPrompt) {
            throw new Error('Midjourney requires a prompt');
        }

        const q = midjourneyQualityToQParam(input.quality);
        const promptWithoutQ = rawPrompt
            .replace(/\s--q\s+[\d.]+/gi, '')
            .trim();
        const prompt = `${promptWithoutQ} --q ${q}`;

        const body: Record<string, unknown> = {
            prompt,
            model: 'midjourney',
        };

        if (input.aspectRatio?.trim()) {
            body.midjourneyParams = {
                aspect_ratio: input.aspectRatio.trim(),
            };
        }

        const response = await this.post<ApiframeSubmitResponse>(
            '/v2/images/generate',
            body,
        );
        const jobId = response.jobId;
        if (!jobId) {
            throw new Error('Apiframe did not return jobId');
        }

        return { providerJobId: jobId, estimatedTokenCost: 0 };
    }

    private async createSunoJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        if (
            !hasSunoGenerationSeed({
                prompt: input.prompt,
                lyrics: input.sunoLyrics,
                instrumental: input.sunoInstrumental,
                genreId: input.sunoGenreId,
                moodId: input.sunoMoodId,
            })
        ) {
            throw new Error(
                'Suno requires a prompt, lyrics, or instrumental with genre/mood',
            );
        }

        const style =
            input.sunoStyle?.trim() ||
            buildSunoStyleTags({
                genreId: input.sunoGenreId,
                moodId: input.sunoMoodId,
            });

        const instrumental = Boolean(input.sunoInstrumental);
        const lyrics = input.sunoLyrics?.trim();
        const description = input.prompt?.trim();
        const autoLyrics = Boolean(input.sunoAutoLyrics);

        let prompt: string;
        let customMode: boolean;

        if (instrumental) {
            customMode = false;
            prompt =
                description ||
                style ||
                'instrumental track';
        } else if (lyrics) {
            customMode = true;
            prompt = lyrics;
        } else if (autoLyrics && description) {
            customMode = true;
            prompt = description;
        } else {
            customMode = false;
            prompt = description || style || 'song';
        }

        if (!customMode && prompt.length > 500) {
            customMode = true;
            // Long description without explicit lyrics → ask Suno to write lyrics.
            if (!lyrics) {
                // keep prompt as description via auto_lyrics
            }
        }

        const sunoParams: Record<string, unknown> = {
            custom_mode: customMode,
            instrumental,
            model_version: this.resolveSunoModelVersion(
                input.sunoModelVersion,
            ),
        };

        if (style) {
            sunoParams.style = style.slice(0, 1000);
        }
        if (input.sunoTitle?.trim()) {
            sunoParams.title = input.sunoTitle.trim().slice(0, 80);
        }
        if (input.sunoNegativeTags?.trim()) {
            sunoParams.negative_tags = input.sunoNegativeTags
                .trim()
                .slice(0, 500);
        }
        if (input.sunoVocalGender === 'm' || input.sunoVocalGender === 'f') {
            sunoParams.vocal_gender = input.sunoVocalGender;
        }
        if (customMode && !lyrics && (autoLyrics || !instrumental)) {
            if (autoLyrics || (!lyrics && description && customMode)) {
                sunoParams.auto_lyrics = true;
            }
        }
        if (typeof input.sunoStyleWeight === 'number') {
            sunoParams.style_weight = input.sunoStyleWeight;
        }
        if (typeof input.sunoWeirdnessConstraint === 'number') {
            sunoParams.weirdness_constraint = input.sunoWeirdnessConstraint;
        }

        const body = {
            prompt: prompt.slice(0, customMode ? 5000 : 500),
            model: 'suno',
            sunoParams,
        };

        const response = await this.post<ApiframeSubmitResponse>(
            '/v2/music/generate',
            body,
        );
        const jobId = response.jobId;
        if (!jobId) {
            throw new Error('Apiframe did not return jobId');
        }

        return { providerJobId: jobId, estimatedTokenCost: 0 };
    }

    private async createActionJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const action = input.apiframeAction!;
        const parentJobId = input.parentProviderJobId?.trim();
        if (!parentJobId) {
            throw new Error('Apiframe action requires parentProviderJobId');
        }

        if (toolId === AiToolId.MIDJOURNEY) {
            return this.createMidjourneyAction(action, parentJobId, input);
        }
        if (toolId === AiToolId.SUNO) {
            return this.createSunoAction(action, parentJobId, input);
        }

        throw new Error(`Apiframe actions not supported for ${toolId}`);
    }

    private async createMidjourneyAction(
        action: ApiframeAction,
        parentJobId: string,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const body: Record<string, unknown> = {
            parentJobId,
            action,
        };

        if (action === 'upsample' || action === 'variation') {
            const index = input.actionIndex;
            if (!index || index < 1 || index > 4) {
                throw new Error(`${action} requires actionIndex 1–4`);
            }
            body.index = index;
        }

        if (action === 'pan') {
            const direction = input.actionDirection;
            if (
                !direction ||
                !['up', 'down', 'left', 'right'].includes(direction)
            ) {
                throw new Error('pan requires actionDirection');
            }
            body.direction = direction;
        }

        if (action === 'inpaint') {
            const maskIndex = input.attachmentRoles?.findIndex(
                (role) => role === 'mask',
            );
            const maskBuffer =
                (maskIndex != null && maskIndex >= 0
                    ? input.files?.[maskIndex]?.buffer
                    : undefined) ??
                input.files?.find((f) => f.mimeType.startsWith('image/'))
                    ?.buffer;
            if (!maskBuffer?.length) {
                throw new Error('inpaint requires a mask image');
            }
            body.mask = maskBuffer.toString('base64');
            if (input.prompt?.trim()) {
                body.prompt = input.prompt.trim().slice(0, 2000);
            }
        }

        const response = await this.post<ApiframeSubmitResponse>(
            '/v2/images/midjourney/action',
            body,
        );
        const jobId = response.jobId;
        if (!jobId) {
            throw new Error('Apiframe did not return jobId for MJ action');
        }
        return { providerJobId: jobId, estimatedTokenCost: 0 };
    }

    private async createSunoAction(
        action: ApiframeAction,
        parentJobId: string,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const body: Record<string, unknown> = {
            parentJobId,
            action,
        };

        if (input.trackId?.trim()) {
            body.trackId = input.trackId.trim();
        } else if (input.actionIndex === 1 || input.actionIndex === 2) {
            body.index = input.actionIndex;
        } else {
            throw new Error(`${action} requires actionIndex 1–2 or trackId`);
        }

        if (action === 'extend') {
            if (typeof input.continueAt === 'number') {
                body.continueAt = input.continueAt;
            }
            if (input.prompt?.trim()) {
                body.prompt = input.prompt.trim().slice(0, 5000);
            }
            if (input.sunoTitle?.trim()) {
                body.title = input.sunoTitle.trim().slice(0, 80);
            }
            const style =
                input.sunoStyle?.trim() ||
                buildSunoStyleTags({
                    genreId: input.sunoGenreId,
                    moodId: input.sunoMoodId,
                });
            if (style) {
                body.style = style.slice(0, 1000);
            }
            if (input.sunoNegativeTags?.trim()) {
                body.negative_tags = input.sunoNegativeTags.trim().slice(0, 500);
            }
        }

        if (action === 'cover' || action === 'add_vocals') {
            if (input.prompt?.trim()) {
                body.prompt = input.prompt.trim().slice(0, 5000);
            }
            if (input.sunoTitle?.trim()) {
                body.title = input.sunoTitle.trim().slice(0, 80);
            }
            const style =
                input.sunoStyle?.trim() ||
                buildSunoStyleTags({
                    genreId: input.sunoGenreId,
                    moodId: input.sunoMoodId,
                });
            if (style) {
                body.style = style.slice(0, 1000);
            }
            if (input.sunoNegativeTags?.trim()) {
                body.negative_tags = input.sunoNegativeTags.trim().slice(0, 500);
            }
            if (
                action === 'cover' &&
                typeof input.sunoAudioWeight === 'number'
            ) {
                body.audio_weight = input.sunoAudioWeight;
            }
        }

        const response = await this.post<ApiframeSubmitResponse>(
            '/v2/music/suno/action',
            body,
        );
        const jobId = response.jobId;
        if (!jobId) {
            throw new Error('Apiframe did not return jobId for Suno action');
        }
        return { providerJobId: jobId, estimatedTokenCost: 0 };
    }

    private mapCompletedResult(
        toolId: AiToolId,
        job: ApiframeJobResponse,
    ): AiGenerationResult | null {
        const result = job.result;
        if (!result) {
            return null;
        }

        if (toolId === AiToolId.MIDJOURNEY) {
            const images = (result.images ?? []).filter(Boolean);
            if (!images.length) {
                return null;
            }

            const isGrid = images.length >= 4 && Boolean(result.gridUrl);
            const kind = isGrid ? 'midjourney_grid' : 'midjourney_single';
            const resultJson: ApiframeResultJson = {
                kind,
                images,
                gridUrl: result.gridUrl,
                eligibleActions: eligibleActionsForKind(kind),
            };

            return {
                type: 'image',
                url: result.gridUrl || images[0],
                additionalUrls: isGrid
                    ? images
                    : images.length > 1
                      ? images.slice(1)
                      : undefined,
                resultJson,
            };
        }

        if (toolId === AiToolId.SUNO) {
            const tracks = this.normalizeTracks(result.tracks);
            if (!tracks.length) {
                return null;
            }

            const isStems =
                tracks.length === 2 &&
                tracks.every(
                    (t) => t.id === 'vocals' || t.id === 'instrumental',
                );
            const kind = isStems ? 'suno_stems' : 'suno_tracks';
            const resultJson: ApiframeResultJson = {
                kind,
                tracks,
                eligibleActions: eligibleActionsForKind(kind),
            };

            return {
                type: 'audio',
                url: tracks[0].audioUrl,
                mimeType: 'audio/mpeg',
                additionalUrls: tracks.slice(1).map((t) => t.audioUrl),
                resultJson,
            };
        }

        return null;
    }

    private normalizeTracks(
        raw?: ApiframeJobResponse['result'] extends infer R
            ? R extends { tracks?: infer T }
                ? T
                : never
            : never,
    ): ApiframeTrack[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw
            .filter((t) => t?.audioUrl)
            .map((t) => ({
                id: String(t!.id ?? ''),
                audioUrl: String(t!.audioUrl),
                imageUrl: t!.imageUrl ?? null,
                title: t!.title ?? null,
                tags: t!.tags ?? null,
                duration: t!.duration ?? null,
            }));
    }

    private resolveSunoModelVersion(
        value?: string,
    ): SunoModelVersion {
        if (
            value &&
            (SUNO_MODEL_VERSIONS as readonly string[]).includes(value)
        ) {
            return value as SunoModelVersion;
        }
        return DEFAULT_SUNO_MODEL_VERSION;
    }

    private mapStatus(
        status?: string,
    ): 'pending' | 'processing' | 'completed' | 'failed' {
        const normalized = (status ?? '').toUpperCase();
        if (normalized === 'COMPLETED' || normalized === 'SUCCESS') {
            return 'completed';
        }
        if (
            normalized === 'FAILED' ||
            normalized === 'ERROR' ||
            normalized === 'CANCELLED'
        ) {
            return 'failed';
        }
        if (normalized === 'PROCESSING' || normalized === 'RUNNING') {
            return 'processing';
        }
        return 'pending';
    }

    private formatError(message: string): string {
        return message.trim() || 'Generation failed';
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('APIFRAME_API_KEY is not configured');
        }
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, body, {
                    headers: {
                        'X-API-Key': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                    validateStatus: (s) => s >= 200 && s < 300,
                }),
            );
            return response.data;
        } catch (error) {
            throw this.toHttpError(error, path);
        }
    }

    private async get<T>(path: string): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<T>(`${this.baseUrl}${path}`, {
                    headers: { 'X-API-Key': this.apiKey },
                    validateStatus: (s) => s >= 200 && s < 300,
                }),
            );
            return response.data;
        } catch (error) {
            throw this.toHttpError(error, path);
        }
    }

    private toHttpError(error: unknown, path: string): Error {
        if (error instanceof AxiosError) {
            const data = error.response?.data as
                | { message?: string; error?: string; details?: unknown }
                | string
                | undefined;
            const message =
                typeof data === 'string'
                    ? data
                    : (data?.message ??
                      data?.error ??
                      error.message);
            this.logger.warn(
                {
                    path,
                    status: error.response?.status,
                    data,
                },
                'Apiframe HTTP error',
            );
            return new Error(
                typeof message === 'string'
                    ? message
                    : `Apiframe request failed (${error.response?.status ?? 'network'})`,
            );
        }
        return error instanceof Error
            ? error
            : new Error('Apiframe request failed');
    }
}

/** Re-export for callers that only need the tool check. */
export function isApiframeTool(toolId: AiToolId): boolean {
    const tool = getToolById(toolId);
    return tool?.provider === AiProviderId.APIFRAME;
}
