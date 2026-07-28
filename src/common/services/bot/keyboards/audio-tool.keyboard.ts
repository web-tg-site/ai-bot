import { Markup } from 'telegraf';
import { AiToolId } from '@/common/services/ai/types';
import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';
import { SUNO_DURATIONS } from '@/common/config/suno-audio.config';
import { I18nBundle } from '../i18n';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';

export type AudioToolKeyboardMode = 'main' | 'settings' | 'duration';

export function isAudioDeliveryTool(toolId: AiToolId): boolean {
    return (
        toolId === AiToolId.VOICE_CLONE ||
        toolId === AiToolId.SOUND_GENERATOR ||
        toolId === AiToolId.VIDEO_TO_AUDIO ||
        toolId === AiToolId.SUNO
    );
}

export function generateAudioToolReplyKeyboard(
    i18n: I18nBundle,
    toolId: AiToolId,
    settings: VoiceToolSettings,
    keyboardMode: AudioToolKeyboardMode = 'main',
) {
    if (toolId === AiToolId.SUNO) {
        return generateSunoReplyKeyboard(i18n, toolId, settings, keyboardMode);
    }

    return Markup.keyboard([
        [
            i18n.voiceTool.sendAsFileButton(
                resolveVoiceSendAsFile(toolId, settings),
            ),
        ],
        [i18n.buttons.back],
    ]).resize();
}

function generateSunoReplyKeyboard(
    i18n: I18nBundle,
    toolId: AiToolId,
    settings: VoiceToolSettings,
    keyboardMode: AudioToolKeyboardMode,
) {
    if (keyboardMode === 'settings') {
        return Markup.keyboard([
            [i18n.voiceTool.changeDurationButton],
            [
                i18n.voiceTool.sendAsFileButton(
                    resolveVoiceSendAsFile(toolId, settings),
                ),
            ],
            [i18n.voiceTool.backToEditor],
        ]).resize();
    }

    if (keyboardMode === 'duration') {
        const selected = settings.durationSeconds ?? 30;
        const tool = getToolById(toolId);
        const durationRow = SUNO_DURATIONS.map((seconds) => {
            const tokens = tool
                ? calculateToolTokenCost(tool, { durationSeconds: seconds })
                : 0;
            return seconds === selected
                ? i18n.voiceTool.durationPickerSelected(seconds, tokens)
                : i18n.voiceTool.durationPickerOption(seconds, tokens);
        });

        return Markup.keyboard([
            durationRow,
            [i18n.voiceTool.backToSettings],
        ]).resize();
    }

    return Markup.keyboard([
        [i18n.voiceTool.settingsButton],
        [i18n.buttons.back],
    ]).resize();
}
