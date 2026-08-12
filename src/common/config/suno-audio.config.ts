import { AiToolId } from '@/common/services/ai/types';

export const SUNO_DURATIONS = [30, 60, 120] as const;

export type SunoDurationSeconds = (typeof SUNO_DURATIONS)[number];

export type SunoPreset = {
    id: string;
    labelRu: string;
    labelEn: string;
    styleTag: string;
};

export const SUNO_NONE_PRESET_ID = 'none';

export const SUNO_GENRES: readonly SunoPreset[] = [
    {
        id: SUNO_NONE_PRESET_ID,
        labelRu: 'Без жанра',
        labelEn: 'No genre',
        styleTag: '',
    },
    {
        id: 'pop',
        labelRu: 'Поп',
        labelEn: 'Pop',
        styleTag: 'pop',
    },
    {
        id: 'rock',
        labelRu: 'Рок',
        labelEn: 'Rock',
        styleTag: 'rock',
    },
    {
        id: 'hip-hop',
        labelRu: 'Хип-хоп',
        labelEn: 'Hip-hop',
        styleTag: 'hip-hop',
    },
    {
        id: 'electronic',
        labelRu: 'Электроника',
        labelEn: 'Electronic',
        styleTag: 'electronic',
    },
    {
        id: 'jazz',
        labelRu: 'Джаз',
        labelEn: 'Jazz',
        styleTag: 'jazz',
    },
    {
        id: 'classical',
        labelRu: 'Классика',
        labelEn: 'Classical',
        styleTag: 'classical',
    },
    {
        id: 'rnb',
        labelRu: 'R&B',
        labelEn: 'R&B',
        styleTag: 'r&b',
    },
    {
        id: 'metal',
        labelRu: 'Метал',
        labelEn: 'Metal',
        styleTag: 'metal',
    },
    {
        id: 'folk',
        labelRu: 'Фолк',
        labelEn: 'Folk',
        styleTag: 'folk',
    },
    {
        id: 'latin',
        labelRu: 'Латино',
        labelEn: 'Latin',
        styleTag: 'latin',
    },
    {
        id: 'lofi',
        labelRu: 'Lo-fi',
        labelEn: 'Lo-fi',
        styleTag: 'lo-fi',
    },
    {
        id: 'soundtrack',
        labelRu: 'Саундтрек',
        labelEn: 'Soundtrack',
        styleTag: 'cinematic soundtrack',
    },
] as const;

export const SUNO_MOODS: readonly SunoPreset[] = [
    {
        id: SUNO_NONE_PRESET_ID,
        labelRu: 'Без настроения',
        labelEn: 'No mood',
        styleTag: '',
    },
    {
        id: 'uplifting',
        labelRu: 'Окрыляющее',
        labelEn: 'Uplifting',
        styleTag: 'uplifting',
    },
    {
        id: 'melancholic',
        labelRu: 'Меланхоличное',
        labelEn: 'Melancholic',
        styleTag: 'melancholic',
    },
    {
        id: 'energetic',
        labelRu: 'Энергичное',
        labelEn: 'Energetic',
        styleTag: 'energetic',
    },
    {
        id: 'calm',
        labelRu: 'Спокойное',
        labelEn: 'Calm',
        styleTag: 'calm',
    },
    {
        id: 'dark',
        labelRu: 'Тёмное',
        labelEn: 'Dark',
        styleTag: 'dark',
    },
    {
        id: 'romantic',
        labelRu: 'Романтичное',
        labelEn: 'Romantic',
        styleTag: 'romantic',
    },
    {
        id: 'epic',
        labelRu: 'Эпичное',
        labelEn: 'Epic',
        styleTag: 'epic',
    },
    {
        id: 'playful',
        labelRu: 'Игривое',
        labelEn: 'Playful',
        styleTag: 'playful',
    },
] as const;

export function isSunoTool(toolId: AiToolId): boolean {
    return toolId === AiToolId.SUNO;
}

export function normalizeSunoDuration(
    durationSeconds?: number,
): SunoDurationSeconds {
    if (
        durationSeconds &&
        (SUNO_DURATIONS as readonly number[]).includes(durationSeconds)
    ) {
        return durationSeconds as SunoDurationSeconds;
    }

    if (durationSeconds) {
        return SUNO_DURATIONS.reduce((closest, value) =>
            Math.abs(value - durationSeconds) <
            Math.abs(closest - durationSeconds)
                ? value
                : closest,
        );
    }

    return 30;
}

export function normalizeSunoGenreId(genreId?: string): string {
    if (genreId && SUNO_GENRES.some((preset) => preset.id === genreId)) {
        return genreId;
    }
    return SUNO_NONE_PRESET_ID;
}

export function normalizeSunoMoodId(moodId?: string): string {
    if (moodId && SUNO_MOODS.some((preset) => preset.id === moodId)) {
        return moodId;
    }
    return SUNO_NONE_PRESET_ID;
}

export function getSunoGenreById(genreId?: string): SunoPreset {
    const normalized = normalizeSunoGenreId(genreId);
    return (
        SUNO_GENRES.find((preset) => preset.id === normalized) ?? SUNO_GENRES[0]
    );
}

export function getSunoMoodById(moodId?: string): SunoPreset {
    const normalized = normalizeSunoMoodId(moodId);
    return (
        SUNO_MOODS.find((preset) => preset.id === normalized) ?? SUNO_MOODS[0]
    );
}

export function buildSunoStyleTags(params: {
    genreId?: string;
    moodId?: string;
}): string | undefined {
    const tags = [
        getSunoGenreById(params.genreId).styleTag,
        getSunoMoodById(params.moodId).styleTag,
    ]
        .map((tag) => tag.trim())
        .filter(Boolean);

    return tags.length ? tags.join(', ') : undefined;
}

export function hasSunoGenerationSeed(params: {
    prompt?: string;
    lyrics?: string;
    instrumental?: boolean;
    genreId?: string;
    moodId?: string;
}): boolean {
    if (params.prompt?.trim()) {
        return true;
    }
    if (!params.instrumental && params.lyrics?.trim()) {
        return true;
    }
    if (
        params.instrumental &&
        (normalizeSunoGenreId(params.genreId) !== SUNO_NONE_PRESET_ID ||
            normalizeSunoMoodId(params.moodId) !== SUNO_NONE_PRESET_ID)
    ) {
        return true;
    }
    return false;
}
