import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AiProviderId, AiToolId } from '@/common/services/ai/types';
import { getToolById } from '@/common/config/ai-tools.registry';
import {
    DEFAULT_ASPECT_RATIOS,
    DEFAULT_IMAGE_QUALITIES,
    DEFAULT_RESOLUTIONS,
    ImageCapabilityDescriptor,
    ImageModelCapabilities,
    SHARPII_NANO_BANANA_RESOLUTIONS,
    STATIC_IMAGE_ASPECT_RATIOS,
    TOPAZ_SCALES,
    getOpenRouterModelForTool,
    isImageToolWithAspectSettings,
    isTopazTool,
} from '@/common/config/image-editor-capabilities.config';
import {
    resolveUiAspectRatios,
    normalizeAspectRatioFromList,
} from '@/common/config/aspect-ratio.config';

type OpenRouterEndpointsResponse = {
    endpoints?: Array<{
        supported_parameters?: Record<string, ImageCapabilityDescriptor>;
    }>;
};

@Injectable()
export class ImageCapabilitiesService implements OnModuleInit {
    private readonly apiKey: string;
    private readonly cache = new Map<string, ImageModelCapabilities>();

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(ImageCapabilitiesService.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('OPENROUTER_API_KEY') ?? '';
    }

    async onModuleInit() {
        await this.warmCache();
    }

    getAspectRatios(toolId: AiToolId): string[] {
        if (isTopazTool(toolId)) {
            return [];
        }

        const staticRatios =
            STATIC_IMAGE_ASPECT_RATIOS[toolId] ?? DEFAULT_ASPECT_RATIOS;

        return resolveUiAspectRatios(staticRatios);
    }

    getResolutions(toolId: AiToolId): string[] {
        if (toolId === AiToolId.MIDJOURNEY || isTopazTool(toolId)) {
            return [];
        }

        if (this.isSharpiiNanoBanana(toolId)) {
            return [...SHARPII_NANO_BANANA_RESOLUTIONS];
        }

        const model = getOpenRouterModelForTool(toolId);
        if (!model) {
            return [];
        }

        const resolutions = this.cache.get(model)?.resolutions ?? [];
        return resolutions;
    }

    getQualities(toolId: AiToolId): string[] {
        if (
            toolId === AiToolId.MIDJOURNEY ||
            isTopazTool(toolId) ||
            this.isSharpiiNanoBanana(toolId)
        ) {
            return [];
        }

        const model = getOpenRouterModelForTool(toolId);
        if (!model) {
            return [];
        }

        return this.cache.get(model)?.qualities ?? [];
    }

    supportsQuality(toolId: AiToolId): boolean {
        return this.getQualities(toolId).length > 0;
    }

    getTopazScales(): readonly number[] {
        return TOPAZ_SCALES;
    }

    supportsResolution(toolId: AiToolId): boolean {
        return this.getResolutions(toolId).length > 0;
    }

    supportsAspectSettings(toolId: AiToolId): boolean {
        return isImageToolWithAspectSettings(toolId);
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
        const allowed = this.getQualities(toolId);
        if (!allowed.length) {
            return undefined;
        }
        if (quality && allowed.includes(quality)) {
            return quality;
        }
        if (allowed.includes('auto')) {
            return 'auto';
        }
        return allowed[0];
    }

    normalizeTopazScale(scale?: number): number {
        if (
            scale &&
            TOPAZ_SCALES.includes(scale as (typeof TOPAZ_SCALES)[number])
        ) {
            return scale;
        }
        return TOPAZ_SCALES[0];
    }

    private async warmCache() {
        if (!this.apiKey) {
            this.logger.warn(
                'OPENROUTER_API_KEY missing — using default image capabilities',
            );
            return;
        }

        const models = [
            getOpenRouterModelForTool(AiToolId.GPT_IMAGES),
            getOpenRouterModelForTool(AiToolId.FLUX),
            getOpenRouterModelForTool(AiToolId.SEEDREAM),
        ].filter(Boolean) as string[];

        await Promise.all(
            models.map(async (model) => {
                try {
                    const capabilities =
                        await this.fetchModelCapabilities(model);
                    this.cache.set(model, capabilities);
                } catch (error) {
                    this.logger.warn(
                        `Failed to load image capabilities for ${model}: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                    );
                    this.cache.set(model, {
                        aspectRatios: [...DEFAULT_ASPECT_RATIOS],
                        resolutions: [],
                        qualities: [],
                    });
                }
            }),
        );
    }

    private async fetchModelCapabilities(
        model: string,
    ): Promise<ImageModelCapabilities> {
        const response = await firstValueFrom(
            this.httpService.get<OpenRouterEndpointsResponse>(
                `${this.getImageModelsBaseUrl()}/${this.toModelPath(model)}/endpoints`,
                {
                    headers: this.getHeaders(),
                    timeout: 30000,
                },
            ),
        );

        const supported = response.data.endpoints?.[0]?.supported_parameters;
        return {
            aspectRatios: supported?.aspect_ratio
                ? this.readEnumValues(
                      supported.aspect_ratio,
                      DEFAULT_ASPECT_RATIOS,
                  )
                : [...DEFAULT_ASPECT_RATIOS],
            resolutions: supported?.resolution
                ? this.readEnumValues(supported.resolution, DEFAULT_RESOLUTIONS)
                : [],
            qualities: supported?.quality
                ? this.readEnumValues(
                      supported.quality,
                      DEFAULT_IMAGE_QUALITIES,
                  )
                : [],
        };
    }

    private getImageModelsBaseUrl(): string {
        return 'https://openrouter.ai/api/v1/images/models';
    }

    private toModelPath(model: string): string {
        return model
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');
    }

    private getHeaders(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.apiKey}`,
        };
    }

    private readEnumValues(
        descriptor: ImageCapabilityDescriptor | undefined,
        fallback: readonly string[],
    ): string[] {
        if (descriptor?.type === 'enum' && descriptor.values.length) {
            return descriptor.values;
        }
        return [...fallback];
    }

    private isSharpiiNanoBanana(toolId: AiToolId): boolean {
        const tool = getToolById(toolId);
        return (
            toolId === AiToolId.NANO_BANANA &&
            tool?.provider === AiProviderId.SHARPII
        );
    }
}
