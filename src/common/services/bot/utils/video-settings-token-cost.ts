import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';
import { resolveBillingDurationSeconds } from '@/common/services/ai/utils/resolve-billing-duration';
import { AiToolId } from '@/common/services/ai/types';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';

/** Token preview for video settings using provider-effective duration. */
export function calculateVideoSettingsTokenCost(
    toolId: AiToolId,
    settings: Pick<
        VideoToolSettings,
        | 'durationSeconds'
        | 'resolution'
        | 'quality'
        | 'higgsfieldMotionId'
        | 'veoMode'
    >,
    overrides?: {
        durationSeconds?: number;
        resolution?: string;
        quality?: string;
    },
): number {
    const tool = getToolById(toolId);
    if (!tool) {
        return 0;
    }

    const durationSeconds = resolveBillingDurationSeconds(toolId, {
        durationSeconds:
            overrides?.durationSeconds ??
            settings.durationSeconds ??
            tool.defaultDurationSeconds,
        higgsfieldMotionId: settings.higgsfieldMotionId,
        resolution: overrides?.resolution ?? settings.resolution,
        veoMode: settings.veoMode,
    });

    return calculateToolTokenCost(tool, {
        durationSeconds,
        resolution: overrides?.resolution ?? settings.resolution,
        quality: overrides?.quality ?? settings.quality,
    });
}
