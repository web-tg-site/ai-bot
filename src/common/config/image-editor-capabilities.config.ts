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

/** OpenRouter Nano Banana 2 aspect ratios (subset shown in UI picker). */
export const NANO_BANANA_ASPECT_RATIOS = [...UI_ASPECT_RATIOS] as const;

export const NANO_BANANA_MAX_REFERENCES = 10;

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
    AiToolId.MIDJOURNEY,
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

export function getImageMaxReferences(toolId: AiToolId): number {
    if (toolId === AiToolId.NANO_BANANA) {
        return NANO_BANANA_MAX_REFERENCES;
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
