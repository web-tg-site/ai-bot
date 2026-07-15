import { Markup } from 'telegraf';
import { I18nBundle } from '../i18n';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import { AiToolId } from '@/common/services/ai/types';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';
import {
    ElevenLabsVoiceOption,
    getElevenLabsVoiceLabel,
} from '@/common/config/elevenlabs-voices.config';
import { chunkKeyboardRow } from './keyboard-grid';

export type VoiceKeyboardMode = 'main' | 'settings' | 'preview';

export function generateElevenLabsVoiceReplyKeyboard(
    i18n: I18nBundle,
    options: {
        settings: VoiceToolSettings;
        keyboardMode: VoiceKeyboardMode;
        localeTag: 'ru-RU' | 'en-US';
        voices: ElevenLabsVoiceOption[];
    },
) {
    if (options.keyboardMode === 'settings') {
        return generateVoicePickerKeyboard(i18n, options);
    }

    if (options.keyboardMode === 'preview') {
        return Markup.keyboard([
            [i18n.voiceTool.confirmVoiceButton],
            [i18n.voiceTool.rejectVoiceButton],
            [i18n.voiceTool.backToVoiceList],
        ]).resize();
    }

    return Markup.keyboard([
        [i18n.voiceTool.selectVoiceButton],
        [i18n.buttons.back],
    ]).resize();
}

function generateVoicePickerKeyboard(
    i18n: I18nBundle,
    options: {
        settings: VoiceToolSettings;
        localeTag: 'ru-RU' | 'en-US';
        voices: ElevenLabsVoiceOption[];
    },
) {
    const currentVoiceId = options.settings.elevenLabsVoiceId;
    const labels = options.voices.map((voice) => {
        const label = getVoiceLabel(voice, options.localeTag);
        return voice.id === currentVoiceId
            ? i18n.voiceTool.voicePickerSelected(label)
            : i18n.voiceTool.voicePickerOption(label);
    });

    const rows = chunkKeyboardRow(labels).map((chunk) => [...chunk]);
    rows.unshift([
        i18n.voiceTool.sendAsFileButton(
            resolveVoiceSendAsFile(AiToolId.ELEVENLABS_VOICE, options.settings),
        ),
    ]);
    rows.push([i18n.voiceTool.backToEditor]);
    return Markup.keyboard(rows).resize();
}

function getVoiceLabel(
    voice: ElevenLabsVoiceOption,
    localeTag: 'ru-RU' | 'en-US',
): string {
    return localeTag === 'ru-RU' ? voice.labelRu : voice.labelEn;
}

export function resolveVoiceIdFromPickerLabel(
    text: string,
    i18n: I18nBundle,
    localeTag: 'ru-RU' | 'en-US',
    voices: ElevenLabsVoiceOption[],
): string | null {
    for (const voice of voices) {
        const label = getVoiceLabel(voice, localeTag);
        if (
            text === i18n.voiceTool.voicePickerOption(label) ||
            text === i18n.voiceTool.voicePickerSelected(label)
        ) {
            return voice.id;
        }
    }
    return null;
}

export function getVoiceLabelById(
    voiceId: string,
    localeTag: 'ru-RU' | 'en-US',
    voices?: ElevenLabsVoiceOption[],
): string {
    const fromList = voices?.find((voice) => voice.id === voiceId);
    if (fromList) {
        return getVoiceLabel(fromList, localeTag);
    }
    return getElevenLabsVoiceLabel(voiceId, localeTag);
}
