import { Markup } from 'telegraf';
import { AiToolId } from '@/common/services/ai/types';
import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';
import {
    SUNO_DURATIONS,
    SUNO_GENRES,
    SUNO_MOODS,
    SUNO_NONE_PRESET_ID,
    getSunoGenreById,
    getSunoMoodById,
    normalizeSunoGenreId,
    normalizeSunoMoodId,
} from '@/common/config/suno-audio.config';
import { SOUND_GENERATOR_DURATIONS } from '@/common/config/sound-generator.config';
import { I18nBundle } from '../i18n';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';

export type AudioToolKeyboardMode =
    | 'main'
    | 'settings'
    | 'duration'
    | 'genre'
    | 'mood'
    | 'lyrics';

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

export function audioToolSupportsSunoControls(toolId: AiToolId): boolean {
    return toolId === AiToolId.SUNO;
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
        const rows: string[][] = [[i18n.voiceTool.changeDurationButton]];

        if (audioToolSupportsSunoControls(toolId)) {
            const genre = getSunoGenreById(settings.sunoGenreId);
            const mood = getSunoMoodById(settings.sunoMoodId);
            const localeIsEn = i18n.localeTag === 'en-US';
            rows.push([
                i18n.voiceTool.changeGenreButton(
                    localeIsEn ? genre.labelEn : genre.labelRu,
                ),
            ]);
            rows.push([
                i18n.voiceTool.changeMoodButton(
                    localeIsEn ? mood.labelEn : mood.labelRu,
                ),
            ]);
            rows.push([
                i18n.voiceTool.instrumentalButton(
                    Boolean(settings.sunoInstrumental),
                ),
            ]);
            rows.push([
                i18n.voiceTool.lyricsButton(Boolean(settings.sunoLyrics?.trim())),
            ]);
        }

        rows.push([
            i18n.voiceTool.sendAsFileButton(
                resolveVoiceSendAsFile(toolId, settings),
            ),
        ]);
        rows.push([i18n.voiceTool.backToEditor]);
        return Markup.keyboard(rows).resize();
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

    if (keyboardMode === 'genre' && audioToolSupportsSunoControls(toolId)) {
        const selected = normalizeSunoGenreId(settings.sunoGenreId);
        const localeIsEn = i18n.localeTag === 'en-US';
        const buttons = SUNO_GENRES.map((preset) => {
            const label = localeIsEn ? preset.labelEn : preset.labelRu;
            return preset.id === selected
                ? i18n.voiceTool.genrePickerSelected(label)
                : i18n.voiceTool.genrePickerOption(label);
        });
        return Markup.keyboard(chunkButtons(buttons, 2).concat([
            [i18n.voiceTool.backToSettings],
        ])).resize();
    }

    if (keyboardMode === 'mood' && audioToolSupportsSunoControls(toolId)) {
        const selected = normalizeSunoMoodId(settings.sunoMoodId);
        const localeIsEn = i18n.localeTag === 'en-US';
        const buttons = SUNO_MOODS.map((preset) => {
            const label = localeIsEn ? preset.labelEn : preset.labelRu;
            return preset.id === selected
                ? i18n.voiceTool.moodPickerSelected(label)
                : i18n.voiceTool.moodPickerOption(label);
        });
        return Markup.keyboard(chunkButtons(buttons, 2).concat([
            [i18n.voiceTool.backToSettings],
        ])).resize();
    }

    if (keyboardMode === 'lyrics' && audioToolSupportsSunoControls(toolId)) {
        const rows: string[][] = [];
        if (settings.sunoLyrics?.trim()) {
            rows.push([i18n.voiceTool.clearLyricsButton]);
        }
        rows.push([i18n.voiceTool.backToSettings]);
        return Markup.keyboard(rows).resize();
    }

    return Markup.keyboard([
        [i18n.voiceTool.settingsButton],
        [i18n.buttons.back],
    ]).resize();
}

function chunkButtons(buttons: string[], size: number): string[][] {
    const rows: string[][] = [];
    for (let i = 0; i < buttons.length; i += size) {
        rows.push(buttons.slice(i, i + size));
    }
    return rows;
}

export function buildSunoSettingsSummary(
    i18n: I18nBundle,
    settings: VoiceToolSettings,
): string[] {
    const genre = getSunoGenreById(settings.sunoGenreId);
    const mood = getSunoMoodById(settings.sunoMoodId);
    const localeIsEn = i18n.localeTag === 'en-US';
    const parts = [
        i18n.voiceTool.genreLine(
            localeIsEn ? genre.labelEn : genre.labelRu,
            genre.id !== SUNO_NONE_PRESET_ID,
        ),
        i18n.voiceTool.moodLine(
            localeIsEn ? mood.labelEn : mood.labelRu,
            mood.id !== SUNO_NONE_PRESET_ID,
        ),
        i18n.voiceTool.instrumentalLine(Boolean(settings.sunoInstrumental)),
        i18n.voiceTool.lyricsLine(Boolean(settings.sunoLyrics?.trim())),
    ];
    return parts;
}
