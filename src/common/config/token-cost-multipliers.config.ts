import { AiToolId } from '@/common/services/ai/types';

const IMAGE_RESOLUTION_MULTIPLIERS: Record<string, number> = {
    '1K': 1.0,
    '2K': 1.5,
    '4K': 2.0,
};

const IMAGE_QUALITY_MULTIPLIERS: Record<string, number> = {
    auto: 1.0,
    low: 1.0,
    medium: 1.0,
    high: 1.5,
};

const VIDEO_RESOLUTION_MULTIPLIERS: Record<string, number> = {
    '720p': 1.0,
    '1080p': 1.25,
};

const VIDEO_QUALITY_MULTIPLIERS: Record<string, number> = {
    standard: 1.0,
    high: 1.5,
};

const IMAGE_TOOLS_WITH_RESOLUTION_COST: AiToolId[] = [
    AiToolId.GPT_IMAGES,
    AiToolId.FLUX,
    AiToolId.NANO_BANANA,
    AiToolId.SEEDREAM,
];

const IMAGE_TOOLS_WITH_QUALITY_COST: AiToolId[] = [
    AiToolId.GPT_IMAGES,
    AiToolId.FLUX,
    AiToolId.SEEDREAM,
];

const VIDEO_TOOLS_WITH_RESOLUTION_COST: AiToolId[] = [
    AiToolId.SORA,
    AiToolId.SEEDANCE,
    AiToolId.HEYGEN,
];

const VIDEO_TOOLS_WITH_QUALITY_COST: AiToolId[] = [AiToolId.SORA];

export function getImageResolutionMultiplier(
    toolId: AiToolId,
    resolution?: string,
): number {
    if (!resolution || !IMAGE_TOOLS_WITH_RESOLUTION_COST.includes(toolId)) {
        return 1.0;
    }
    return IMAGE_RESOLUTION_MULTIPLIERS[resolution] ?? 1.0;
}

export function getImageQualityMultiplier(
    toolId: AiToolId,
    quality?: string,
): number {
    if (!quality || !IMAGE_TOOLS_WITH_QUALITY_COST.includes(toolId)) {
        return 1.0;
    }
    return IMAGE_QUALITY_MULTIPLIERS[quality] ?? 1.0;
}

export function getVideoResolutionMultiplier(
    toolId: AiToolId,
    resolution?: string,
): number {
    if (!resolution || !VIDEO_TOOLS_WITH_RESOLUTION_COST.includes(toolId)) {
        return 1.0;
    }
    return VIDEO_RESOLUTION_MULTIPLIERS[resolution] ?? 1.0;
}

export function getVideoQualityMultiplier(
    toolId: AiToolId,
    quality?: string,
): number {
    if (!quality || !VIDEO_TOOLS_WITH_QUALITY_COST.includes(toolId)) {
        return 1.0;
    }
    return VIDEO_QUALITY_MULTIPLIERS[quality] ?? 1.0;
}

export function applyImageCostMultipliers(
    toolId: AiToolId,
    baseCost: number,
    options?: { resolution?: string; quality?: string },
): number {
    const resolutionMult = getImageResolutionMultiplier(
        toolId,
        options?.resolution,
    );
    const qualityMult = getImageQualityMultiplier(toolId, options?.quality);
    return Math.ceil(baseCost * resolutionMult * qualityMult);
}

export function applyVideoCostMultipliers(
    toolId: AiToolId,
    baseCost: number,
    options?: { resolution?: string; quality?: string },
): number {
    const resolutionMult = getVideoResolutionMultiplier(
        toolId,
        options?.resolution,
    );
    const qualityMult = getVideoQualityMultiplier(toolId, options?.quality);
    return Math.ceil(baseCost * resolutionMult * qualityMult);
}
