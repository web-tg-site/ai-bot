import { AiToolId } from '@/common/services/ai/types';
import { I18nBundle } from '../i18n';
import { ru } from '../i18n/locales/ru';
import { en } from '../i18n/locales/en';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';
import {
    AudioToolKeyboardMode,
    audioToolSupportsDuration,
    getAudioToolDurations,
    isAudioDeliveryTool,
} from '../keyboards/audio-tool.keyboard';
import { normalizeSunoDuration } from '@/common/config/suno-audio.config';
import { normalizeSoundGeneratorDuration } from '@/common/config/sound-generator.config';
import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';

export type AudioToolButtonAction =
    | { type: 'toggle_send_as_file' }
    | { type: 'open_settings' }
    | { type: 'open_duration' }
    | { type: 'back_to_settings' }
    | { type: 'back_to_editor' }
    | { type: 'set_duration'; value: number };

export function resolveAudioToolButtonAction(
    text: string,
    i18n: I18nBundle,
    toolId: AiToolId,
    settings: VoiceToolSettings,
    keyboardMode: AudioToolKeyboardMode = 'main',
): AudioToolButtonAction | null {
    if (!isAudioDeliveryTool(toolId)) {
        return null;
    }

    if (audioToolSupportsDuration(toolId)) {
        if (text === i18n.voiceTool.settingsButton) {
            return { type: 'open_settings' };
        }
        if (text === i18n.voiceTool.changeDurationButton) {
            return { type: 'open_duration' };
        }
        if (text === i18n.voiceTool.backToSettings) {
            return { type: 'back_to_settings' };
        }
        if (text === i18n.voiceTool.backToEditor) {
            return { type: 'back_to_editor' };
        }

        if (keyboardMode === 'duration') {
            const tool = getToolById(toolId);
            for (const seconds of getAudioToolDurations(toolId)) {
                const tokens = tool
                    ? calculateToolTokenCost(tool, { durationSeconds: seconds })
                    : 0;
                if (
                    text ===
                        i18n.voiceTool.durationPickerOption(seconds, tokens) ||
                    text ===
                        i18n.voiceTool.durationPickerSelected(seconds, tokens)
                ) {
                    return { type: 'set_duration', value: seconds };
                }
            }
        }
    }

    if (keyboardMode === 'settings' || !audioToolSupportsDuration(toolId)) {
        const sendAsFile = resolveVoiceSendAsFile(toolId, settings);
        if (
            text === i18n.voiceTool.sendAsFileButton(sendAsFile) ||
            text === i18n.voiceTool.sendAsFileButton(!sendAsFile)
        ) {
            return { type: 'toggle_send_as_file' };
        }
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
            text === i18n.voiceTool.sendAsFileButton(false) ||
            text === i18n.voiceTool.settingsButton ||
            text === i18n.voiceTool.changeDurationButton ||
            text === i18n.voiceTool.backToSettings ||
            text === i18n.voiceTool.backToEditor
        ) {
            return true;
        }

        for (const toolId of [AiToolId.SUNO, AiToolId.SOUND_GENERATOR]) {
            const tool = getToolById(toolId);
            for (const seconds of getAudioToolDurations(toolId)) {
                const tokens = tool
                    ? calculateToolTokenCost(tool, {
                          durationSeconds: seconds,
                      })
                    : 0;
                if (
                    text ===
                        i18n.voiceTool.durationPickerOption(seconds, tokens) ||
                    text ===
                        i18n.voiceTool.durationPickerSelected(seconds, tokens)
                ) {
                    return true;
                }
            }
        }
    }

    return false;
}

export function resolveSunoDurationSeconds(
    settings?: VoiceToolSettings | null,
): number {
    return normalizeSunoDuration(settings?.durationSeconds);
}

export function resolveSoundGeneratorDurationSeconds(
    settings?: VoiceToolSettings | null,
): number {
    return normalizeSoundGeneratorDuration(settings?.durationSeconds);
}

export function resolveAudioToolDurationSeconds(
    toolId: AiToolId,
    settings?: VoiceToolSettings | null,
): number {
    if (toolId === AiToolId.SOUND_GENERATOR) {
        return resolveSoundGeneratorDurationSeconds(settings);
    }
    if (toolId === AiToolId.SUNO) {
        return resolveSunoDurationSeconds(settings);
    }
    return settings?.durationSeconds ?? 30;
}
