import { Markup } from 'telegraf';
import { AiToolId } from '@/common/services/ai/types';
import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';
import { SUNO_DURATIONS } from '@/common/config/suno-audio.config';
import { SOUND_GENERATOR_DURATIONS } from '@/common/config/sound-generator.config';
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

export function audioToolSupportsDuration(toolId: AiToolId): boolean {
    return toolId === AiToolId.SUNO || toolId === AiToolId.SOUND_GENERATOR;
}

export function getAudioToolDurations(toolId: AiToolId): readonly number[] {
    if (toolId === AiToolId.SUNO) {
        return SUNO_DURATIONS;
    }
    if (toolId === AiToolId.SOUND_GENERATOR) {
        return SOUND_GENERATOR_DURATIONS;
    }
    return [];
}

export function generateAudioToolReplyKeyboard(
    i18n: I18nBundle,
    toolId: AiToolId,
    settings: VoiceToolSettings,
    keyboardMode: AudioToolKeyboardMode = 'main',
) {
    if (audioToolSupportsDuration(toolId)) {
        return generateDurationCapableAudioReplyKeyboard(
            i18n,
            toolId,
            settings,
            keyboardMode,
        );
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

function generateDurationCapableAudioReplyKeyboard(
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
        const tool = getToolById(toolId);
        const selected =
            settings.durationSeconds ?? tool?.defaultDurationSeconds ?? 30;
        const durations = getAudioToolDurations(toolId);
        const durationButtons = durations.map((seconds) => {
            const tokens = tool
                ? calculateToolTokenCost(tool, { durationSeconds: seconds })
                : 0;
            return seconds === selected
                ? i18n.voiceTool.durationPickerSelected(seconds, tokens)
                : i18n.voiceTool.durationPickerOption(seconds, tokens);
        });

        const rows =
            durationButtons.length > 3
                ? [
                      durationButtons.slice(0, 2),
                      durationButtons.slice(2),
                      [i18n.voiceTool.backToSettings],
                  ]
                : [durationButtons, [i18n.voiceTool.backToSettings]];

        return Markup.keyboard(rows).resize();
    }

    return Markup.keyboard([
        [i18n.voiceTool.settingsButton],
        [i18n.buttons.back],
    ]).resize();
}
