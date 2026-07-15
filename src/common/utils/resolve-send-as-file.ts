import { AiToolId } from '@/common/services/ai/types';
import { ImageToolSettings } from '@/common/types/image-tool-settings.type';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';

export function getDefaultSendAsFile(toolId: AiToolId): boolean {
    return toolId === AiToolId.SOUND_GENERATOR;
}

export function resolveSendAsFile(
    toolId: AiToolId,
    settings?: {
        sendAsFile?: boolean;
    } | null,
): boolean {
    if (settings?.sendAsFile !== undefined) {
        return settings.sendAsFile;
    }
    return getDefaultSendAsFile(toolId);
}

export function resolveImageSendAsFile(
    toolId: AiToolId,
    settings?: ImageToolSettings | null,
): boolean {
    return resolveSendAsFile(toolId, settings);
}

export function resolveVideoSendAsFile(
    toolId: AiToolId,
    settings?: VideoToolSettings | null,
): boolean {
    return resolveSendAsFile(toolId, settings);
}

export function resolveVoiceSendAsFile(
    toolId: AiToolId,
    settings?: VoiceToolSettings | null,
): boolean {
    return resolveSendAsFile(toolId, settings);
}
