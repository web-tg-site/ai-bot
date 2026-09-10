import { AiToolId } from '@/common/services/ai/types';
import { ImageToolSettings } from '@/common/types/image-tool-settings.type';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';

const AUDIO_FILE_DEFAULT_TOOLS = new Set<AiToolId>([
    AiToolId.ELEVENLABS_VOICE,
    AiToolId.VOICE_CLONE,
    AiToolId.SOUND_GENERATOR,
    AiToolId.SUNO,
    AiToolId.VIDEO_TO_AUDIO,
]);

export function getDefaultSendAsFile(toolId: AiToolId): boolean {
    return AUDIO_FILE_DEFAULT_TOOLS.has(toolId);
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
