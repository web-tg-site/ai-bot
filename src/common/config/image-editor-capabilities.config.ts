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
export const NANO_BANANA_RESOLUTIONS = ['512', '1K', '2K', '4K'] as const;

export function formatImageResolutionLabel(resolution: string): string {
    if (resolution === '512') return '512p';
    if (resolution.toLowerCase() === '4k') return '4K';
    return resolution;
}

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

export const MIDJOURNEY_MAX_REFERENCES = 10;

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

export function isBflFluxTool(toolId: AiToolId): boolean {
    return toolId === AiToolId.FLUX;
}

/** Flux accepts prompt-less requests when attachments imply deblur/vto. */
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
    if (toolId === AiToolId.MIDJOURNEY) {
        return MIDJOURNEY_MAX_REFERENCES;
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

export const MIDJOURNEY_IMAGE_QUALITIES = ['low', 'medium', 'high'] as const;

/** Midjourney --q values for our low/medium/high picker. */
export const MIDJOURNEY_Q_VALUES: Record<
    (typeof MIDJOURNEY_IMAGE_QUALITIES)[number],
    string
> = {
    low: '0.5',
    medium: '1',
    high: '2',
};

/**
 * Labels must describe what the parameter really does, otherwise the picker
 * promises pixels it does not deliver:
 * - GPT Images sends OpenAI `quality`; output stays 1024–1536 px either way.
 * - Flux has no quality field — the tier picks the pixel base (768/1024/1440),
 *   so it is a fidelity tier, not a promise of 1K/2K/4K.
 * - Midjourney maps the tier to `--q`, i.e. render effort, not resolution.
 */
const IMAGE_QUALITY_LABELS: Record<string, { ru: string; en: string }> = {
    auto: { ru: 'Авто', en: 'Auto' },
    low: { ru: 'Базовое', en: 'Basic' },
    medium: { ru: 'Стандартное', en: 'Standard' },
    high: { ru: 'Высокое', en: 'High' },
};

const MIDJOURNEY_QUALITY_LABELS: Record<string, { ru: string; en: string }> = {
    low: { ru: 'Черновик', en: 'Draft' },
    medium: { ru: 'Стандартное', en: 'Standard' },
    high: { ru: 'Детальное', en: 'Detailed' },
};

export function formatImageQualityLabel(
    quality: string,
    locale: 'ru-RU' | 'en-US',
    toolId?: AiToolId,
): string {
    const table =
        toolId === AiToolId.MIDJOURNEY
            ? MIDJOURNEY_QUALITY_LABELS
            : IMAGE_QUALITY_LABELS;
    const labels = table[quality];
    if (labels) {
        return locale === 'ru-RU' ? labels.ru : labels.en;
    }
    return quality;
}

export function midjourneyQualityToQParam(quality?: string): string {
    if (
        quality &&
        (MIDJOURNEY_IMAGE_QUALITIES as readonly string[]).includes(quality)
    ) {
        return MIDJOURNEY_Q_VALUES[
            quality as (typeof MIDJOURNEY_IMAGE_QUALITIES)[number]
        ];
    }
    return MIDJOURNEY_Q_VALUES.medium;
}
