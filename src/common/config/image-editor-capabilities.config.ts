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

export const TOPAZ_SCALES = [2, 4, 6] as const;

export type TopazScale = (typeof TOPAZ_SCALES)[number];

export type ImageCapabilityDescriptor =
    | { type: 'enum'; values: string[] }
    | { type: 'range'; min: number; max: number }
    | { type: 'boolean' };

export type ImageModelCapabilities = {
    aspectRatios: string[];
    resolutions: string[];
};

export const STATIC_IMAGE_ASPECT_RATIOS: Partial<Record<AiToolId, string[]>> = {
    [AiToolId.GPT_IMAGES]: [...UI_ASPECT_RATIOS],
    [AiToolId.FLUX]: [...UI_ASPECT_RATIOS],
    [AiToolId.NANO_BANANA]: [...UI_ASPECT_RATIOS],
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
