import { AiToolId } from '@/common/services/ai/types';
import { I18nBundle } from '../i18n';
import { ru } from '../i18n/locales/ru';
import { en } from '../i18n/locales/en';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';
import {
    AudioToolKeyboardMode,
    audioToolSupportsDuration,
    audioToolSupportsSunoControls,
    getAudioToolDurations,
    isAudioDeliveryTool,
} from '../keyboards/audio-tool.keyboard';
import {
    SUNO_GENRES,
    SUNO_MOODS,
    normalizeSunoDuration,
} from '@/common/config/suno-audio.config';
import { normalizeSoundGeneratorDuration } from '@/common/config/sound-generator.config';
import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';

export type AudioToolButtonAction =
    | { type: 'toggle_send_as_file' }
    | { type: 'open_settings' }
    | { type: 'open_duration' }
    | { type: 'open_genre' }
    | { type: 'open_mood' }
    | { type: 'open_lyrics' }
    | { type: 'toggle_instrumental' }
    | { type: 'clear_lyrics' }
    | { type: 'back_to_settings' }
    | { type: 'back_to_editor' }
    | { type: 'set_duration'; value: number }
    | { type: 'set_genre'; value: string }
    | { type: 'set_mood'; value: string };

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

        if (audioToolSupportsSunoControls(toolId)) {
            const genre = settings.sunoGenreId;
            const mood = settings.sunoMoodId;
            const localeIsEn = i18n.localeTag === 'en-US';
            const genreLabel = localeIsEn
                ? (SUNO_GENRES.find((p) => p.id === genre)?.labelEn ??
                  SUNO_GENRES[0].labelEn)
                : (SUNO_GENRES.find((p) => p.id === genre)?.labelRu ??
                  SUNO_GENRES[0].labelRu);
            const moodLabel = localeIsEn
                ? (SUNO_MOODS.find((p) => p.id === mood)?.labelEn ??
                  SUNO_MOODS[0].labelEn)
                : (SUNO_MOODS.find((p) => p.id === mood)?.labelRu ??
                  SUNO_MOODS[0].labelRu);

            if (
                text === i18n.voiceTool.changeGenreButton(genreLabel) ||
                SUNO_GENRES.some((preset) => {
                    const label = localeIsEn ? preset.labelEn : preset.labelRu;
                    return text === i18n.voiceTool.changeGenreButton(label);
                })
            ) {
                return { type: 'open_genre' };
            }
            if (
                text === i18n.voiceTool.changeMoodButton(moodLabel) ||
                SUNO_MOODS.some((preset) => {
                    const label = localeIsEn ? preset.labelEn : preset.labelRu;
                    return text === i18n.voiceTool.changeMoodButton(label);
                })
            ) {
                return { type: 'open_mood' };
            }
            if (
                text === i18n.voiceTool.instrumentalButton(true) ||
                text === i18n.voiceTool.instrumentalButton(false)
            ) {
                return { type: 'toggle_instrumental' };
            }
            if (
                text === i18n.voiceTool.lyricsButton(true) ||
                text === i18n.voiceTool.lyricsButton(false)
            ) {
                return { type: 'open_lyrics' };
            }
            if (text === i18n.voiceTool.clearLyricsButton) {
                return { type: 'clear_lyrics' };
            }
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

        if (keyboardMode === 'genre' && audioToolSupportsSunoControls(toolId)) {
            const localeIsEn = i18n.localeTag === 'en-US';
            for (const preset of SUNO_GENRES) {
                const label = localeIsEn ? preset.labelEn : preset.labelRu;
                if (
                    text === i18n.voiceTool.genrePickerOption(label) ||
                    text === i18n.voiceTool.genrePickerSelected(label)
                ) {
                    return { type: 'set_genre', value: preset.id };
                }
            }
        }

        if (keyboardMode === 'mood' && audioToolSupportsSunoControls(toolId)) {
            const localeIsEn = i18n.localeTag === 'en-US';
            for (const preset of SUNO_MOODS) {
                const label = localeIsEn ? preset.labelEn : preset.labelRu;
                if (
                    text === i18n.voiceTool.moodPickerOption(label) ||
                    text === i18n.voiceTool.moodPickerSelected(label)
                ) {
                    return { type: 'set_mood', value: preset.id };
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
            text === i18n.voiceTool.backToEditor ||
            text === i18n.voiceTool.clearLyricsButton ||
            text === i18n.voiceTool.instrumentalButton(true) ||
            text === i18n.voiceTool.instrumentalButton(false) ||
            text === i18n.voiceTool.lyricsButton(true) ||
            text === i18n.voiceTool.lyricsButton(false)
        ) {
            return true;
        }

        for (const preset of SUNO_GENRES) {
            const label =
                i18n.localeTag === 'en-US' ? preset.labelEn : preset.labelRu;
            if (
                text === i18n.voiceTool.changeGenreButton(label) ||
                text === i18n.voiceTool.genrePickerOption(label) ||
                text === i18n.voiceTool.genrePickerSelected(label)
            ) {
                return true;
            }
        }

        for (const preset of SUNO_MOODS) {
            const label =
                i18n.localeTag === 'en-US' ? preset.labelEn : preset.labelRu;
            if (
                text === i18n.voiceTool.changeMoodButton(label) ||
                text === i18n.voiceTool.moodPickerOption(label) ||
                text === i18n.voiceTool.moodPickerSelected(label)
            ) {
                return true;
            }
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
