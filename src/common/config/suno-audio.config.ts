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

const SUNO_STYLE_ALIASES: ReadonlyArray<{ key: string; tag: string }> = [
    { key: 'рэп', tag: 'hip-hop' },
    { key: 'реп', tag: 'hip-hop' },
    { key: 'rap', tag: 'hip-hop' },
    { key: 'блюз', tag: 'blues' },
    { key: 'кантри', tag: 'country' },
    { key: 'регги', tag: 'reggae' },
    { key: 'панк', tag: 'punk' },
    { key: 'инди', tag: 'indie' },
    { key: 'техно', tag: 'techno' },
    { key: 'хаус', tag: 'house' },
    { key: 'диско', tag: 'disco' },
    { key: 'соул', tag: 'soul' },
    { key: 'фанк', tag: 'funk' },
    { key: 'оркестр', tag: 'orchestral' },
    { key: 'акустика', tag: 'acoustic' },
    { key: 'баллада', tag: 'ballad' },
    { key: 'женский вокал', tag: 'female vocals' },
    { key: 'мужской вокал', tag: 'male vocals' },
    { key: 'грустный', tag: 'melancholic' },
    { key: 'грустная', tag: 'melancholic' },
    { key: 'веселый', tag: 'playful' },
    { key: 'быстрый', tag: 'energetic' },
    { key: 'медленный', tag: 'slow' },
];

function normalizeSunoStyleKey(value: string): string {
    return value
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[‐‑‒–—―\-_/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function sunoStyleMatchers(): Array<{ key: string; tag: string }> {
    const matchers: Array<{ key: string; tag: string }> = [];
    for (const preset of [...SUNO_GENRES, ...SUNO_MOODS]) {
        if (!preset.styleTag) continue;
        for (const name of [
            preset.labelRu,
            preset.labelEn,
            preset.styleTag,
            preset.id,
        ]) {
            const key = normalizeSunoStyleKey(name);
            if (key) matchers.push({ key, tag: preset.styleTag });
        }
    }
    for (const alias of SUNO_STYLE_ALIASES) {
        matchers.push({
            key: normalizeSunoStyleKey(alias.key),
            tag: alias.tag,
        });
    }
    return matchers.sort((a, b) => b.key.length - a.key.length);
}

/** Suno cover style is English tags. «Хип-хоп» otherwise stays the source genre. */
export function resolveSunoStyleText(raw: string): string {
    const text = raw.trim();
    if (!text) return text;

    const matchers = sunoStyleMatchers();
    const phrases = text
        .split(/[,;]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    const tags: string[] = [];
    const add = (tag: string) => {
        const next = tag.trim();
        if (
            next &&
            !tags.some((item) => item.toLowerCase() === next.toLowerCase())
        ) {
            tags.push(next);
        }
    };

    for (const phrase of phrases.length ? phrases : [text]) {
        const normalized = normalizeSunoStyleKey(phrase);
        const exact = matchers.find((matcher) => matcher.key === normalized);
        if (exact) {
            add(exact.tag);
            continue;
        }

        let rest = ` ${normalized} `;
        for (const matcher of matchers) {
            const needle = ` ${matcher.key} `;
            if (!rest.includes(needle)) continue;
            add(matcher.tag);
            rest = rest.split(needle).join(' ');
        }
        const leftover = rest.replace(/\s+/g, ' ').trim();
        if (leftover && /[a-z]/i.test(leftover)) {
            add(leftover);
        } else if (!tags.length) {
            add(phrase);
        }
    }

    return tags.join(', ').slice(0, 1000);
}

export function sunoCoverSourceTags(
    resultJson: unknown,
    actionIndex?: number,
): string | undefined {
    if (!resultJson || typeof resultJson !== 'object') return undefined;
    const tracks = (resultJson as { tracks?: Array<{ tags?: string | null }> })
        .tracks;
    if (!tracks?.length) return undefined;
    const track =
        (actionIndex && actionIndex >= 1
            ? tracks[actionIndex - 1]
            : undefined) ?? tracks[0];
    const tags = track?.tags?.trim();
    if (!tags) return undefined;
    const genreTags = new Set(
        SUNO_GENRES.map((preset) => preset.styleTag).filter(Boolean),
    );
    const matched = resolveSunoStyleText(tags)
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => genreTags.has(tag));
    const negative = matched.length ? matched.join(', ') : tags;
    return negative.slice(0, 500);
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
