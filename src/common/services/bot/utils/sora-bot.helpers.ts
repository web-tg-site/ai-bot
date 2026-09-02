import { AiToolId } from '@/common/services/ai/types';
import { AiGenerationInput } from '@/common/services/ai/types/ai-generation-result.type';
import { BotSession } from '@/common/services/ai/types/ai-session-state.type';
import {
    SORA_EXTEND_DURATIONS,
} from '@/common/config/video-editor-capabilities.config';
import { VideoCapabilitiesService } from '@/common/services/ai/video-capabilities.service';
import { AiFileInput } from '@/common/services/ai/types/ai-generation-result.type';
import { isVideoMedia } from '@/common/utils/media-kind';

export type SoraVideoMode = 'create' | 'extend' | 'edit';

export function isSoraExtendMode(session: BotSession): boolean {
    return (
        session.ai?.activeToolId === AiToolId.SORA &&
        session.ai.soraVideoMode === 'extend'
    );
}

export function resolveVideoDurationsForSession(
    session: BotSession | undefined,
    toolId: AiToolId,
    capabilitiesService: VideoCapabilitiesService,
): number[] {
    if (toolId === AiToolId.SORA && session?.ai?.soraVideoMode === 'extend') {
        return [...SORA_EXTEND_DURATIONS];
    }
    return capabilitiesService.getSupportedDurations(toolId);
}

export function detectSoraVideoModeFromFiles(
    files: AiFileInput[],
): SoraVideoMode {
    const hasVideo = files.some((file) =>
        isVideoMedia(file.mimeType, file.fileName),
    );
    return hasVideo ? 'edit' : 'create';
}

export function buildSoraGenerationFields(
    session: BotSession,
    referenceFiles: AiFileInput[],
): Pick<
    AiGenerationInput,
    'soraVideoMode' | 'sourceGenerationId'
> {
    if (session.ai?.activeToolId !== AiToolId.SORA) {
        return {};
    }

    const explicitMode = session.ai.soraVideoMode;
    const mode: SoraVideoMode =
        explicitMode === 'extend'
            ? 'extend'
            : explicitMode === 'edit'
              ? 'edit'
              : detectSoraVideoModeFromFiles(referenceFiles);

    const fields: Pick<
        AiGenerationInput,
        'soraVideoMode' | 'sourceGenerationId'
    > = { soraVideoMode: mode };

    if (mode === 'extend' && session.ai.soraExtendSourceId?.trim()) {
        fields.sourceGenerationId = session.ai.soraExtendSourceId.trim();
    }

    return fields;
}

export function resetSoraSessionMode(session: BotSession) {
    if (!session.ai) {
        return;
    }
    session.ai.soraVideoMode = undefined;
    session.ai.soraExtendSourceId = undefined;
}
