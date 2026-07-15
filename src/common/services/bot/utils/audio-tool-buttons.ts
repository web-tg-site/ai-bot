import { AiToolId } from '@/common/services/ai/types';
import { I18nBundle } from '../i18n';
import { ru } from '../i18n/locales/ru';
import { en } from '../i18n/locales/en';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';
import { isAudioDeliveryTool } from '../keyboards/audio-tool.keyboard';

export type AudioToolButtonAction = { type: 'toggle_send_as_file' };

export function resolveAudioToolButtonAction(
    text: string,
    i18n: I18nBundle,
    toolId: AiToolId,
    settings: VoiceToolSettings,
): AudioToolButtonAction | null {
    if (!isAudioDeliveryTool(toolId)) {
        return null;
    }

    const sendAsFile = resolveVoiceSendAsFile(toolId, settings);
    if (
        text === i18n.voiceTool.sendAsFileButton(sendAsFile) ||
        text === i18n.voiceTool.sendAsFileButton(!sendAsFile)
    ) {
        return { type: 'toggle_send_as_file' };
    }

    return null;
}

export function isAudioToolControlButton(text: string | undefined): boolean {
    if (!text) {
        return false;
    }

    for (const i18n of [ru, en]) {
        if (
            text === i18n.voiceTool.sendAsFileButton(true) ||
            text === i18n.voiceTool.sendAsFileButton(false)
        ) {
            return true;
        }
    }

    return false;
}
