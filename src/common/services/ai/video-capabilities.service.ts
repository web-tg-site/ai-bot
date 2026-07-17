import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AiToolId } from '@/common/services/ai/types';
import {
    DEFAULT_VIDEO_ASPECT_RATIOS,
    DEFAULT_VIDEO_RESOLUTIONS,
    STATIC_VIDEO_DURATIONS,
    STATIC_VIDEO_RESOLUTIONS,
    STATIC_VIDEO_QUALITIES,
    VIDEO_DURATION_TIERS,
    BUILTIN_VIDEO_STYLE_PRESETS,
    VideoQualityOption,
    VideoStyleOption,
    buildModelNativeQualityOptions,
    buildModelNativeStyleOptions,
    getOpenRouterVideoModelForTool,
    isVideoFlowTool,
} from '@/common/config/video-editor-capabilities.config';
import {
    normalizeAspectRatioFromList,
    resolveUiAspectRatios,
} from '@/common/config/aspect-ratio.config';
import { getToolById } from '@/common/config/ai-tools.registry';

export type VideoModelCapabilities = {
    aspectRatios: string[];
    resolutions: string[];
    durations: number[];
    allowedPassthrough: string[];
};

type OpenRouterVideoModel = {
    id: string;
    supported_durations?: number[];
    supported_aspect_ratios?: string[];
    supported_resolutions?: string[];
    allowed_passthrough_parameters?: string[];
};

type OpenRouterVideoModelsResponse = {
    data?: OpenRouterVideoModel[];
};

@Injectable()
export class VideoCapabilitiesService implements OnModuleInit {
    private readonly apiKey: string;
    private readonly cache = new Map<string, VideoModelCapabilities>();

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(VideoCapabilitiesService.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('OPENROUTER_API_KEY') ?? '';
    }

    async onModuleInit() {
        await this.warmCache();
    }

    getAspectRatios(toolId: AiToolId): string[] {
        if (!isVideoFlowTool(toolId)) {
            return [];
        }

        return resolveUiAspectRatios(DEFAULT_VIDEO_ASPECT_RATIOS);
    }

    getResolutions(toolId: AiToolId): string[] {
        if (!isVideoFlowTool(toolId)) {
            return [];
        }

        const staticResolutions = STATIC_VIDEO_RESOLUTIONS[toolId];
        if (staticResolutions?.length) {
            return [...staticResolutions];
        }

        const model = getOpenRouterVideoModelForTool(toolId);
        if (!model) {
            return [...DEFAULT_VIDEO_RESOLUTIONS];
        }

        const resolutions = this.cache.get(model)?.resolutions ?? [];
        return resolutions.length
            ? resolutions
            : [...DEFAULT_VIDEO_RESOLUTIONS];
    }

    getQualityOptions(toolId: AiToolId): VideoQualityOption[] {
        if (!isVideoFlowTool(toolId)) {
            return [];
        }

        const staticQualities = STATIC_VIDEO_QUALITIES[toolId];
        if (staticQualities?.length) {
            return [...staticQualities];
        }

        const model = getOpenRouterVideoModelForTool(toolId);
        if (!model) {
            return [];
        }

        const allowedPassthrough =
            this.cache.get(model)?.allowedPassthrough ?? [];
        return buildModelNativeQualityOptions(model, allowedPassthrough);
    }

    supportsQuality(toolId: AiToolId): boolean {
        return this.getQualityOptions(toolId).length > 0;
    }

    getSupportedDurations(toolId: AiToolId): number[] {
        if (!isVideoFlowTool(toolId)) {
            return [];
        }

        const modelDurations = this.getModelDurations(toolId);

        // Veo exposes exact model durations (4/6/8), not VIDEO_DURATION_TIERS.
        if (toolId === AiToolId.VEO && modelDurations.length) {
            return [...modelDurations].sort((left, right) => left - right);
        }

        const durations: number[] = VIDEO_DURATION_TIERS.filter((tier) =>
            this.isDurationSupported(toolId, tier, modelDurations),
        );

        const maxDuration = this.getProviderMaxDuration(toolId, modelDurations);
        if (
            maxDuration > 5 &&
            maxDuration < 10 &&
            !durations.includes(maxDuration)
        ) {
            durations.push(maxDuration);
        }

        if (durations.length) {
            return durations.sort((left, right) => left - right);
        }

        return modelDurations;
    }

    getStyleOptions(toolId: AiToolId): VideoStyleOption[] {
        const builtin = [...BUILTIN_VIDEO_STYLE_PRESETS];
        const model = getOpenRouterVideoModelForTool(toolId);
        if (!model) {
            return builtin;
        }

        const allowedPassthrough =
            this.cache.get(model)?.allowedPassthrough ?? [];
        const modelStyles = buildModelNativeStyleOptions(
            model,
            allowedPassthrough,
        );

        return [...builtin, ...modelStyles];
    }

    resolveStyleOption(toolId: AiToolId, styleId?: string): VideoStyleOption {
        const options = this.getStyleOptions(toolId);
        const fallback =
            options.find((option) => option.id === 'none') ?? options[0];
        if (!styleId) {
            return fallback;
        }
        return options.find((option) => option.id === styleId) ?? fallback;
    }

    getStylePresets() {
        return BUILTIN_VIDEO_STYLE_PRESETS;
    }

    supportsAspectSettings(toolId: AiToolId): boolean {
        return this.getAspectRatios(toolId).length > 0;
    }

    supportsResolution(toolId: AiToolId): boolean {
        return this.getResolutions(toolId).length > 0;
    }

    normalizeAspectRatio(toolId: AiToolId, aspectRatio?: string): string {
        return normalizeAspectRatioFromList(
            aspectRatio,
            this.getAspectRatios(toolId),
        );
    }

    normalizeResolution(
        toolId: AiToolId,
        resolution?: string,
    ): string | undefined {
        const allowed = this.getResolutions(toolId);
        if (!allowed.length) {
            return undefined;
        }
        if (resolution && allowed.includes(resolution)) {
            return resolution;
        }
        return allowed[0];
    }

    normalizeQuality(toolId: AiToolId, quality?: string): string | undefined {
        const allowed = this.getQualityOptions(toolId);
        if (!allowed.length) {
            return undefined;
        }
        if (quality && allowed.some((option) => option.value === quality)) {
            return quality;
        }
        return allowed[0]?.value;
    }

    normalizeDuration(toolId: AiToolId, durationSeconds?: number): number {
        const allowed = this.getSupportedDurations(toolId);
        const fallback =
            getToolById(toolId)?.defaultDurationSeconds ?? allowed[0] ?? 5;

        if (!allowed.length) {
            return durationSeconds ?? fallback;
        }

        if (durationSeconds && allowed.includes(durationSeconds)) {
            return durationSeconds;
        }

        if (durationSeconds) {
            return allowed.reduce((closest, value) =>
                Math.abs(value - durationSeconds) <
                Math.abs(closest - durationSeconds)
                    ? value
                    : closest,
            );
        }

        return allowed.includes(fallback) ? fallback : (allowed[0] ?? fallback);
    }

    normalizeStyleId(toolId: AiToolId, styleId?: string): string {
        const options = this.getStyleOptions(toolId);
        if (styleId && options.some((option) => option.id === styleId)) {
            return styleId;
        }
        return 'none';
    }

    resolveProviderDuration(toolId: AiToolId, durationSeconds: number): number {
        const modelDurations = this.getModelDurations(toolId);

        if (toolId === AiToolId.VEO && modelDurations.length) {
            return modelDurations.reduce((closest, value) =>
                Math.abs(value - durationSeconds) <
                Math.abs(closest - durationSeconds)
                    ? value
                    : closest,
            );
        }

        if (toolId === AiToolId.KLING) {
            return Math.min(15, Math.max(3, durationSeconds));
        }

        if (toolId === AiToolId.SORA) {
            return durationSeconds <= 10 ? 10 : 15;
        }

        if (toolId === AiToolId.SEEDANCE) {
            return Math.min(15, Math.max(4, durationSeconds));
        }

        return durationSeconds;
    }

    private getProviderMaxDuration(
        toolId: AiToolId,
        modelDurations: number[],
    ): number {
        if (toolId === AiToolId.KLING || toolId === AiToolId.SEEDANCE) {
            return 15;
        }

        if (toolId === AiToolId.SORA) {
            return 15;
        }

        if (modelDurations.length) {
            return Math.max(...modelDurations);
        }

        return 15;
    }

    private getModelDurations(toolId: AiToolId): number[] {
        const staticDurations = STATIC_VIDEO_DURATIONS[toolId];
        if (staticDurations?.length) {
            return [...staticDurations];
        }

        const model = getOpenRouterVideoModelForTool(toolId);
        if (!model) {
            return [];
        }

        return this.cache.get(model)?.durations ?? [];
    }

    private isDurationSupported(
        toolId: AiToolId,
        tier: number,
        modelDurations: number[],
    ): boolean {
        if (modelDurations.includes(tier)) {
            return true;
        }

        if (toolId === AiToolId.KLING) {
            return tier >= 3 && tier <= 15;
        }

        if (toolId === AiToolId.VEO && modelDurations.length) {
            return modelDurations.some((value) => Math.abs(value - tier) <= 1);
        }

        if (toolId === AiToolId.SORA) {
            return tier === 10 || tier === 15;
        }

        if (toolId === AiToolId.SEEDANCE) {
            return tier >= 4 && tier <= 15;
        }

        if (toolId === AiToolId.HIGGSFIELD || toolId === AiToolId.HEYGEN) {
            return tier === 5 || tier === 15;
        }

        return false;
    }

    private async warmCache() {
        if (!this.apiKey) {
            this.logger.warn(
                'OPENROUTER_API_KEY missing — using default video capabilities',
            );
            return;
        }

        try {
            const response = await firstValueFrom(
                this.httpService.get<OpenRouterVideoModelsResponse>(
                    'https://openrouter.ai/api/v1/videos/models',
                    {
                        headers: {
                            Authorization: `Bearer ${this.apiKey}`,
                        },
                        timeout: 30000,
                    },
                ),
            );

            for (const model of response.data.data ?? []) {
                this.cache.set(model.id, {
                    aspectRatios: model.supported_aspect_ratios?.length
                        ? model.supported_aspect_ratios
                        : [...DEFAULT_VIDEO_ASPECT_RATIOS],
                    resolutions: model.supported_resolutions?.length
                        ? model.supported_resolutions
                        : [...DEFAULT_VIDEO_RESOLUTIONS],
                    durations: model.supported_durations ?? [],
                    allowedPassthrough:
                        model.allowed_passthrough_parameters ?? [],
                });
            }
        } catch (error) {
            this.logger.warn(
                `Failed to load video capabilities: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
}
