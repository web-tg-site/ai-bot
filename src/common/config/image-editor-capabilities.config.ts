import { AiToolId } from '@/common/services/ai/types';
import { getToolById } from '@/common/config/ai-tools.registry';
import { UI_ASPECT_RATIOS } from '@/common/config/aspect-ratio.config';

export const DEFAULT_ASPECT_RATIOS = [...UI_ASPECT_RATIOS];

/** @deprecated Midjourney UI uses UI_ASPECT_RATIOS; kept for Sharpii fallbacks if needed. */
export const MIDJOURNEY_ASPECT_RATIOS = [
    '4:5',
    '3:4',
    '2:3',
    '9:16',
    '16:9',
    '3:2',
    '4:3',
    '1:1',
];

export const DEFAULT_RESOLUTIONS = ['1K', '2K', '4K'];

/** Gemini Nano Banana 2 (gemini-3.1-flash-image) output tiers. */
export const NANO_BANANA_RESOLUTIONS = ['1K', '2K', '4K', '512'] as const;

/** Ultra-wide / ultra-tall ratios supported by Gemini 3.1 Flash Image. */
export const NANO_BANANA_EXTRA_ASPECT_RATIOS = [
    '4:1',
    '1:4',
    '8:1',
    '1:8',
] as const;

/** Gemini Nano Banana 2 aspect ratios (UI picker). */
export const NANO_BANANA_ASPECT_RATIOS = [
    ...UI_ASPECT_RATIOS,
    ...NANO_BANANA_EXTRA_ASPECT_RATIOS,
] as const;

export const NANO_BANANA_MAX_REFERENCES = 14;

/** Seedream 4.5 rejects 1K (below ~3.7M pixels); keep 2K/4K only. */
export const SEEDREAM_RESOLUTIONS = ['2K', '4K'] as const;

export const BFL_MAX_REFERENCES = 8;

export const DEFAULT_IMAGE_QUALITIES = [
    'auto',
    'low',
    'medium',
    'high',
] as const;

export type ImageQuality = (typeof DEFAULT_IMAGE_QUALITIES)[number];

export const TOPAZ_SCALES = [2, 4, 6] as const;

export type TopazScale = (typeof TOPAZ_SCALES)[number];

export type ImageCapabilityDescriptor =
    | { type: 'enum'; values: string[] }
    | { type: 'range'; min: number; max: number }
    | { type: 'boolean' };

export type ImageModelCapabilities = {
    aspectRatios: string[];
    resolutions: string[];
    qualities: string[];
};

export const STATIC_IMAGE_ASPECT_RATIOS: Partial<Record<AiToolId, string[]>> = {
    [AiToolId.GPT_IMAGES]: [...UI_ASPECT_RATIOS],
    [AiToolId.FLUX]: [...UI_ASPECT_RATIOS],
    [AiToolId.NANO_BANANA]: [...NANO_BANANA_ASPECT_RATIOS],
    [AiToolId.SEEDREAM]: [...UI_ASPECT_RATIOS],
    [AiToolId.MIDJOURNEY]: [...UI_ASPECT_RATIOS],
};

export const IMAGE_TOOLS_WITH_REFERENCES: AiToolId[] = [
    AiToolId.GPT_IMAGES,
    AiToolId.FLUX,
    AiToolId.NANO_BANANA,
    AiToolId.SEEDREAM,
];

export const IMAGE_TOOLS_WITH_ASPECT_SETTINGS: AiToolId[] = [
    AiToolId.GPT_IMAGES,
    AiToolId.FLUX,
    AiToolId.NANO_BANANA,
    AiToolId.SEEDREAM,
    AiToolId.MIDJOURNEY,
];

export function isImageToolWithReferences(toolId: AiToolId): boolean {
    return IMAGE_TOOLS_WITH_REFERENCES.includes(toolId);
}

export function isImageToolWithAspectSettings(toolId: AiToolId): boolean {
    return IMAGE_TOOLS_WITH_ASPECT_SETTINGS.includes(toolId);
}

export function isTopazTool(toolId: AiToolId): boolean {
    return toolId === AiToolId.TOPAZ;
}

export function isBflFluxTool(toolId: AiToolId): boolean {
    return toolId === AiToolId.FLUX;
}

/** Flux accepts prompt-less requests when attachments imply deblur/erase/vto. */
export function imageToolRequiresPrompt(toolId: AiToolId): boolean {
    return toolId !== AiToolId.FLUX;
}

export function getImageMaxReferences(toolId: AiToolId): number {
    if (toolId === AiToolId.NANO_BANANA) {
        return NANO_BANANA_MAX_REFERENCES;
    }
    if (toolId === AiToolId.FLUX) {
        return BFL_MAX_REFERENCES;
    }
    return 10;
}

export function getOpenRouterModelForTool(
    toolId: AiToolId,
): string | undefined {
    return getToolById(toolId)?.model;
}

export function calculateTopazTokenCost(
    baseTokenCost: number,
    topazScale: number,
): number {
    return Math.ceil(baseTokenCost * (topazScale / 2));
}

const IMAGE_QUALITY_LABELS: Record<string, { ru: string; en: string }> = {
    auto: { ru: 'Авто', en: 'Auto' },
    low: { ru: '1K', en: '1K' },
    medium: { ru: '2K', en: '2K' },
    high: { ru: '4K', en: '4K' },
};

export function formatImageQualityLabel(
    quality: string,
    locale: 'ru-RU' | 'en-US',
): string {
    const labels = IMAGE_QUALITY_LABELS[quality];
    if (labels) {
        return locale === 'ru-RU' ? labels.ru : labels.en;
    }
    return quality;
}
