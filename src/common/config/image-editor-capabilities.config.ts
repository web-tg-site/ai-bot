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

/** OpenRouter Nano Banana 2 (gemini-3.1-flash-image) output tiers. */
export const NANO_BANANA_RESOLUTIONS = ['1K', '2K', '4K', '512'] as const;

/** Seedream 4.5 rejects 1K (below ~3.7M pixels); keep 2K/4K only. */
export const SEEDREAM_RESOLUTIONS = ['2K', '4K'] as const;

/** OpenRouter Nano Banana 2 aspect ratios (subset shown in UI picker). */
export const NANO_BANANA_ASPECT_RATIOS = [...UI_ASPECT_RATIOS] as const;

export const NANO_BANANA_MAX_REFERENCES = 10;

export const BFL_MAX_REFERENCES = 8;

export const LUMA_IMAGE_MAX_REFERENCES = 9;

export const LUMA_MANGA_ASPECT_RATIOS = ['2:3', '9:16', '1:2', '1:3'] as const;

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

const BFL_FLUX_TOOLS: AiToolId[] = [
    AiToolId.FLUX,
    AiToolId.FLUX_MAX,
    AiToolId.FLUX_FLEX,
    AiToolId.FLUX_KLEIN_9B,
    AiToolId.FLUX_KLEIN_4B,
];

const LUMA_IMAGE_TOOLS: AiToolId[] = [
    AiToolId.LUMA_IMAGE,
    AiToolId.LUMA_IMAGE_MAX,
    AiToolId.LUMA_IMAGE_EDIT,
];

export const STATIC_IMAGE_ASPECT_RATIOS: Partial<Record<AiToolId, string[]>> = {
    [AiToolId.GPT_IMAGES]: [...UI_ASPECT_RATIOS],
    [AiToolId.FLUX]: [...UI_ASPECT_RATIOS],
    [AiToolId.FLUX_MAX]: [...UI_ASPECT_RATIOS],
    [AiToolId.FLUX_FLEX]: [...UI_ASPECT_RATIOS],
    [AiToolId.FLUX_KLEIN_9B]: [...UI_ASPECT_RATIOS],
    [AiToolId.FLUX_KLEIN_4B]: [...UI_ASPECT_RATIOS],
    [AiToolId.FLUX_VTO]: [...UI_ASPECT_RATIOS],
    [AiToolId.NANO_BANANA]: [...NANO_BANANA_ASPECT_RATIOS],
    [AiToolId.SEEDREAM]: [...UI_ASPECT_RATIOS],
    [AiToolId.MIDJOURNEY]: [...UI_ASPECT_RATIOS],
    [AiToolId.LUMA_IMAGE]: [...UI_ASPECT_RATIOS],
    [AiToolId.LUMA_IMAGE_MAX]: [...UI_ASPECT_RATIOS],
    [AiToolId.LUMA_IMAGE_EDIT]: [...UI_ASPECT_RATIOS],
};

export const IMAGE_TOOLS_WITH_REFERENCES: AiToolId[] = [
    AiToolId.GPT_IMAGES,
    AiToolId.FLUX,
    AiToolId.FLUX_MAX,
    AiToolId.FLUX_FLEX,
    AiToolId.FLUX_KLEIN_9B,
    AiToolId.FLUX_KLEIN_4B,
    AiToolId.FLUX_VTO,
    AiToolId.NANO_BANANA,
    AiToolId.SEEDREAM,
    AiToolId.MIDJOURNEY,
    AiToolId.LUMA_IMAGE,
    AiToolId.LUMA_IMAGE_MAX,
    AiToolId.LUMA_IMAGE_EDIT,
];

export const IMAGE_TOOLS_WITH_ASPECT_SETTINGS: AiToolId[] = [
    AiToolId.GPT_IMAGES,
    AiToolId.FLUX,
    AiToolId.FLUX_MAX,
    AiToolId.FLUX_FLEX,
    AiToolId.FLUX_KLEIN_9B,
    AiToolId.FLUX_KLEIN_4B,
    AiToolId.FLUX_VTO,
    AiToolId.NANO_BANANA,
    AiToolId.SEEDREAM,
    AiToolId.MIDJOURNEY,
    AiToolId.LUMA_IMAGE,
    AiToolId.LUMA_IMAGE_MAX,
    AiToolId.LUMA_IMAGE_EDIT,
];

export const IMAGE_TOOLS_REQUIRING_SOURCE: AiToolId[] = [
    AiToolId.FLUX_OUTPAINT,
    AiToolId.FLUX_ERASE,
    AiToolId.FLUX_DEBLUR,
    AiToolId.LUMA_IMAGE_EDIT,
    AiToolId.LUMA_LAYERING,
];

export const IMAGE_TOOLS_WITHOUT_PROMPT: AiToolId[] = [
    AiToolId.FLUX_DEBLUR,
    AiToolId.FLUX_ERASE,
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
    return BFL_FLUX_TOOLS.includes(toolId);
}

export function isLumaImageTool(toolId: AiToolId): boolean {
    return LUMA_IMAGE_TOOLS.includes(toolId);
}

export function imageToolRequiresPrompt(toolId: AiToolId): boolean {
    return !IMAGE_TOOLS_WITHOUT_PROMPT.includes(toolId);
}

export function getImageMaxReferences(toolId: AiToolId): number {
    if (toolId === AiToolId.NANO_BANANA) {
        return NANO_BANANA_MAX_REFERENCES;
    }
    if (toolId === AiToolId.FLUX_ERASE || toolId === AiToolId.FLUX_VTO) {
        return 2;
    }
    if (isBflFluxTool(toolId)) {
        return BFL_MAX_REFERENCES;
    }
    if (
        toolId === AiToolId.LUMA_IMAGE ||
        toolId === AiToolId.LUMA_IMAGE_MAX ||
        toolId === AiToolId.LUMA_IMAGE_EDIT
    ) {
        return LUMA_IMAGE_MAX_REFERENCES;
    }
    if (
        toolId === AiToolId.FLUX_OUTPAINT ||
        toolId === AiToolId.FLUX_DEBLUR ||
        toolId === AiToolId.LUMA_LAYERING
    ) {
        return 1;
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
    low: { ru: 'Низкое', en: 'Low' },
    medium: { ru: 'Среднее', en: 'Medium' },
    high: { ru: 'Высокое', en: 'High' },
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
