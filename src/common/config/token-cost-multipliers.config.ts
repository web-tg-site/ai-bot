import { AiToolId } from '@/common/services/ai/types';

const IMAGE_RESOLUTION_MULTIPLIERS: Record<string, number> = {
    '512': 0.75,
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
    '480p': 1.0,
    '720p': 1.0,
    '1080p': 1.25,
    '4k': 2.0,
    '4K': 2.0,
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
    AiToolId.MIDJOURNEY,
];

const VIDEO_TOOLS_WITH_RESOLUTION_COST: AiToolId[] = [
    AiToolId.SEEDANCE,
    AiToolId.HEYGEN,
    AiToolId.KLING,
    AiToolId.KLING_MOTION,
    AiToolId.VEO,
];

const VIDEO_TOOLS_WITH_QUALITY_COST: AiToolId[] = [];

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
    if (toolId === AiToolId.SEEDANCE) {
        if (resolution === '720p') return 1.25;
        if (resolution === '480p') return 1.0;
        return 1.0;
    }
    if (
        (toolId === AiToolId.KLING || toolId === AiToolId.KLING_MOTION) &&
        resolution === '1080p'
    ) {
        return 1.5;
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
    options?: {
        resolution?: string;
        quality?: string;
        nanoThinkingLevel?: 'minimal' | 'high';
        nanoGoogleSearch?: boolean;
    },
): number {
    const resolutionMult = getImageResolutionMultiplier(
        toolId,
        options?.resolution,
    );
    const qualityMult = getImageQualityMultiplier(toolId, options?.quality);
    let thinkingMult = 1.0;
    let searchMult = 1.0;
    if (toolId === AiToolId.NANO_BANANA) {
        if (options?.nanoThinkingLevel === 'high') {
            thinkingMult = 1.25;
        }
        searchMult = 1.15;
    }
    return Math.ceil(
        baseCost * resolutionMult * qualityMult * thinkingMult * searchMult,
    );
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
