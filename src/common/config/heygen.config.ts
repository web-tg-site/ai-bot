export type HeyGenEngine = 'avatar_iii' | 'avatar_iv' | 'avatar_v';

export type HeyGenBackgroundMode = 'default' | 'remove' | 'color';

export type HeyGenExpressiveness = 'low' | 'medium' | 'high';

export type HeyGenVoiceOption = {
    id: string;
    name: string;
    language: string | null;
    gender: string | null;
    previewUrl: string | null;
};

export type HeyGenAvatarLookOption = {
    id: string;
    name: string;
    previewImageUrl: string | null;
    previewVideoUrl: string | null;
    gender: string | null;
    defaultVoiceId: string | null;
    supportedEngines: HeyGenEngine[];
};

export const DEFAULT_HEYGEN_ENGINE: HeyGenEngine = 'avatar_iv';

export const DEFAULT_HEYGEN_BACKGROUND_MODE: HeyGenBackgroundMode = 'default';

export const DEFAULT_HEYGEN_BACKGROUND_COLOR = '#FFFFFF';

export const DEFAULT_HEYGEN_EXPRESSIVENESS: HeyGenExpressiveness = 'low';

export const DEFAULT_HEYGEN_VOICE_SPEED = 1;

export const DEFAULT_HEYGEN_VOICE_PITCH = 0;

export const HEYGEN_BACKGROUND_COLOR_PRESETS = [
    { id: '#FFFFFF', labelRu: 'Белый', labelEn: 'White' },
    { id: '#000000', labelRu: 'Чёрный', labelEn: 'Black' },
    { id: '#1E3A5F', labelRu: 'Синий', labelEn: 'Blue' },
    { id: '#2D5016', labelRu: 'Зелёный', labelEn: 'Green' },
    { id: '#5C1A1A', labelRu: 'Красный', labelEn: 'Red' },
    { id: '#4A3728', labelRu: 'Коричневый', labelEn: 'Brown' },
] as const;

export const HEYGEN_ENGINE_OPTIONS: Array<{
    id: HeyGenEngine;
    labelRu: string;
    labelEn: string;
}> = [
    { id: 'avatar_iii', labelRu: 'Avatar III', labelEn: 'Avatar III' },
    { id: 'avatar_iv', labelRu: 'Avatar IV', labelEn: 'Avatar IV' },
    { id: 'avatar_v', labelRu: 'Avatar V', labelEn: 'Avatar V' },
];

export const HEYGEN_EXPRESSIVENESS_OPTIONS: Array<{
    id: HeyGenExpressiveness;
    labelRu: string;
    labelEn: string;
}> = [
    { id: 'low', labelRu: 'Низкая', labelEn: 'Low' },
    { id: 'medium', labelRu: 'Средняя', labelEn: 'Medium' },
    { id: 'high', labelRu: 'Высокая', labelEn: 'High' },
];

export function getHeyGenEngineLabel(
    engine: HeyGenEngine | undefined,
    localeTag: 'ru-RU' | 'en-US',
): string {
    const id = engine ?? DEFAULT_HEYGEN_ENGINE;
    const option = HEYGEN_ENGINE_OPTIONS.find((item) => item.id === id);
    if (!option) return id;
    return localeTag === 'ru-RU' ? option.labelRu : option.labelEn;
}

export function getHeyGenExpressivenessLabel(
    value: HeyGenExpressiveness | undefined,
    localeTag: 'ru-RU' | 'en-US',
): string {
    const id = value ?? DEFAULT_HEYGEN_EXPRESSIVENESS;
    const option = HEYGEN_EXPRESSIVENESS_OPTIONS.find((item) => item.id === id);
    if (!option) return id;
    return localeTag === 'ru-RU' ? option.labelRu : option.labelEn;
}

export function getHeyGenBackgroundLabel(
    mode: HeyGenBackgroundMode | undefined,
    color: string | undefined,
    localeTag: 'ru-RU' | 'en-US',
): string {
    const resolved = mode ?? DEFAULT_HEYGEN_BACKGROUND_MODE;
    if (resolved === 'default') {
        return localeTag === 'ru-RU' ? 'По умолчанию' : 'Default';
    }
    if (resolved === 'remove') {
        return localeTag === 'ru-RU' ? 'Без фона' : 'No background';
    }
    const preset = HEYGEN_BACKGROUND_COLOR_PRESETS.find(
        (item) => item.id === color,
    );
    if (preset) {
        return localeTag === 'ru-RU' ? preset.labelRu : preset.labelEn;
    }
    return color ?? (localeTag === 'ru-RU' ? 'Цвет' : 'Color');
}
