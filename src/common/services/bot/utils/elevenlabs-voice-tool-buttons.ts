import { I18nBundle, ru, en } from '../i18n';
import { VoiceKeyboardMode } from '../keyboards/voice.keyboard';
import { resolveVoiceIdFromPickerLabel } from '../keyboards/voice.keyboard';
import { ElevenLabsVoiceOption } from '@/common/config/elevenlabs-voices.config';
import { AiToolId } from '@/common/services/ai/types';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';

export type ElevenLabsVoiceButtonAction =
    | { type: 'open_settings' }
    | { type: 'select_voice'; voiceId: string }
    | { type: 'confirm_voice' }
    | { type: 'reject_voice' }
    | { type: 'toggle_send_as_file' }
    | { type: 'back_to_settings' }
    | { type: 'back_to_editor' };

export function resolveElevenLabsVoiceButtonAction(
    text: string,
    i18n: I18nBundle,
    options: {
        keyboardMode: VoiceKeyboardMode;
        localeTag: 'ru-RU' | 'en-US';
        voices: ElevenLabsVoiceOption[];
        sendAsFile?: boolean;
    },
): ElevenLabsVoiceButtonAction | null {
    if (text === i18n.voiceTool.backToEditor) {
        return { type: 'back_to_editor' };
    }

    if (text === i18n.voiceTool.backToVoiceList) {
        return { type: 'back_to_settings' };
    }

    if (options.keyboardMode === 'preview') {
        if (text === i18n.voiceTool.confirmVoiceButton) {
            return { type: 'confirm_voice' };
        }
        if (text === i18n.voiceTool.rejectVoiceButton) {
            return { type: 'reject_voice' };
        }
        return null;
    }

    if (options.keyboardMode === 'settings') {
        const sendAsFile = resolveVoiceSendAsFile(AiToolId.ELEVENLABS_VOICE, {
            sendAsFile: options.sendAsFile,
        });
        if (
            text === i18n.voiceTool.sendAsFileButton(sendAsFile) ||
            text === i18n.voiceTool.sendAsFileButton(!sendAsFile)
        ) {
            return { type: 'toggle_send_as_file' };
        }

        const voiceId = resolveVoiceIdFromPickerLabel(
            text,
            i18n,
            options.localeTag,
            options.voices,
        );
        if (voiceId) {
            return { type: 'select_voice', voiceId };
        }
        return null;
    }

    if (text === i18n.voiceTool.selectVoiceButton) {
        return { type: 'open_settings' };
    }

    return null;
}

export function isElevenLabsVoiceControlButton(
    text: string | undefined,
): boolean {
    if (!text) {
        return false;
    }

    for (const i18n of [ru, en]) {
        if (
            text === i18n.voiceTool.selectVoiceButton ||
            text === i18n.voiceTool.confirmVoiceButton ||
            text === i18n.voiceTool.rejectVoiceButton ||
            text === i18n.voiceTool.backToVoiceList ||
            text === i18n.voiceTool.backToEditor
        ) {
            return true;
        }

        if (
            text === i18n.voiceTool.sendAsFileButton(true) ||
            text === i18n.voiceTool.sendAsFileButton(false)
        ) {
            return true;
        }

        if (text.startsWith('✓ ')) {
            return true;
        }
    }

    return false;
}
