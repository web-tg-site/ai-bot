import { AiToolId } from '@/common/services/ai/types';
import { getToolById } from '@/common/config/ai-tools.registry';
import { UI_ASPECT_RATIOS } from '@/common/config/aspect-ratio.config';

export const VIDEO_DURATION_TIERS = [5, 15, 30, 60] as const;

export type VideoDurationTier = (typeof VIDEO_DURATION_TIERS)[number];

export const DEFAULT_VIDEO_ASPECT_RATIOS = [...UI_ASPECT_RATIOS];

export const DEFAULT_VIDEO_RESOLUTIONS = ['720p', '1080p'];

export type VideoStyleSource = 'builtin' | 'model';

export type VideoStyleOption = {
    id: string;
    source: VideoStyleSource;
    labelRu: string;
    labelEn: string;
    promptSuffix?: string;
    passthrough?: Record<string, string | number | boolean>;
};

/** CapCut-like universal presets — applied via prompt suffix. */
export const BUILTIN_VIDEO_STYLE_PRESETS: VideoStyleOption[] = [
    {
        id: 'none',
        source: 'builtin',
        labelRu: 'Без стиля',
        labelEn: 'No style',
        promptSuffix: '',
    },
    {
        id: 'cinematic',
        source: 'builtin',
        labelRu: 'Кино',
        labelEn: 'Cinematic',
        promptSuffix:
            'cinematic style, dramatic lighting, smooth camera movement, film grain, shallow depth of field',
    },
    {
        id: 'cyberpunk',
        source: 'builtin',
        labelRu: 'Киберпанк',
        labelEn: 'Cyberpunk',
        promptSuffix:
            'cyberpunk style, neon lights, rain-slicked streets, purple and blue glow, futuristic city, Blade Runner aesthetic',
    },
    {
        id: 'anime',
        source: 'builtin',
        labelRu: 'Аниме',
        labelEn: 'Anime',
        promptSuffix:
            'anime style, cel-shaded, vibrant colors, clean lines, stylized animation',
    },
    {
        id: 'realistic',
        source: 'builtin',
        labelRu: 'Реализм',
        labelEn: 'Realistic',
        promptSuffix:
            'photorealistic style, natural lighting, high detail, DSLR quality, lifelike textures',
    },
    {
        id: '3d',
        source: 'builtin',
        labelRu: '3D',
        labelEn: '3D',
        promptSuffix:
            '3D animation style, rendered look, soft lighting, Pixar-like polish',
    },
    {
        id: 'vintage',
        source: 'builtin',
        labelRu: 'Винтаж',
        labelEn: 'Vintage',
        promptSuffix:
            'vintage film style, warm tones, light leaks, soft focus, 8mm film grain, nostalgic mood',
    },
    {
        id: 'noir',
        source: 'builtin',
        labelRu: 'Нуар',
        labelEn: 'Film noir',
        promptSuffix:
            'film noir style, high contrast black and white, dramatic shadows, moody atmosphere',
    },
    {
        id: 'watercolor',
        source: 'builtin',
        labelRu: 'Акварель',
        labelEn: 'Watercolor',
        promptSuffix:
            'watercolor painting style, soft edges, pastel colors, hand-painted texture',
    },
    {
        id: 'vaporwave',
        source: 'builtin',
        labelRu: 'Вейпорвейв',
        labelEn: 'Vaporwave',
        promptSuffix:
            'vaporwave aesthetic, pink and cyan palette, retro 80s, surreal dreamy atmosphere',
    },
    {
        id: 'documentary',
        source: 'builtin',
        labelRu: 'Документалка',
        labelEn: 'Documentary',
        promptSuffix:
            'documentary style, handheld camera, natural light, authentic raw footage feel',
    },
    {
        id: 'horror',
        source: 'builtin',
        labelRu: 'Хоррор',
        labelEn: 'Horror',
        promptSuffix:
            'horror style, dark atmosphere, eerie lighting, unsettling mood, suspenseful tension',
    },
    {
        id: 'fantasy',
        source: 'builtin',
        labelRu: 'Фэнтези',
        labelEn: 'Fantasy',
        promptSuffix:
            'fantasy style, magical atmosphere, ethereal glow, epic otherworldly scenery',
    },
    {
        id: 'minimal',
        source: 'builtin',
        labelRu: 'Минимализм',
        labelEn: 'Minimal',
        promptSuffix:
            'minimalist style, clean composition, muted palette, simple elegant aesthetics',
    },
    {
        id: 'retro_80s',
        source: 'builtin',
        labelRu: 'Ретро 80-х',
        labelEn: 'Retro 80s',
        promptSuffix:
            '1980s retro style, VHS aesthetic, synthwave colors, nostalgic arcade vibe',
    },
    {
        id: 'pixel',
        source: 'builtin',
        labelRu: 'Пиксель-арт',
        labelEn: 'Pixel art',
        promptSuffix:
            'pixel art style, retro 16-bit, limited color palette, nostalgic game aesthetic',
    },
];

/**
 * Known enum values for model-native style passthrough params.
 * Keyed by OpenRouter model slug → param name → options.
 */
export const MODEL_PASSTHROUGH_STYLE_ENUMS: Record<
    string,
    Record<
        string,
        Array<{
            value: string;
            labelRu: string;
            labelEn: string;
        }>
    >
> = {
    'openai/sora-2-pro': {
        style: [
            { value: 'natural', labelRu: 'Натуральный', labelEn: 'Natural' },
            { value: 'vivid', labelRu: 'Яркий', labelEn: 'Vivid' },
        ],
    },
};

/** Passthrough param names treated as visual style (not quality/technical). */
export const MODEL_STYLE_PASSTHROUGH_PARAMS = new Set(['style']);

export const VIDEO_TOOLS_WITH_REFERENCES: AiToolId[] = [
    AiToolId.KLING,
    AiToolId.VEO,
    AiToolId.SORA,
    AiToolId.SEEDANCE,
    AiToolId.HIGGSFIELD,
];

export const VIDEO_FLOW_TOOLS: AiToolId[] = [
    AiToolId.KLING,
    AiToolId.VEO,
    AiToolId.SORA,
    AiToolId.SEEDANCE,
    AiToolId.HIGGSFIELD,
    AiToolId.HEYGEN,
];

export const VIDEO_TOOLS_WITH_ASPECT_SETTINGS: AiToolId[] = [
    AiToolId.KLING,
    AiToolId.VEO,
    AiToolId.SORA,
    AiToolId.SEEDANCE,
    AiToolId.HIGGSFIELD,
    AiToolId.HEYGEN,
];

export const VIDEO_TOOL_MAX_REFERENCES: Partial<Record<AiToolId, number>> = {
    [AiToolId.KLING]: 10,
    [AiToolId.VEO]: 10,
    [AiToolId.SORA]: 2,
    [AiToolId.SEEDANCE]: 2,
    [AiToolId.HIGGSFIELD]: 1,
};

export const STATIC_VIDEO_DURATIONS: Partial<Record<AiToolId, number[]>> = {
    [AiToolId.SORA]: [10, 15],
    [AiToolId.SEEDANCE]: [5, 15],
    [AiToolId.HIGGSFIELD]: [5, 15],
    [AiToolId.HEYGEN]: [5, 15],
};

export const STATIC_VIDEO_ASPECT_RATIOS: Partial<Record<AiToolId, string[]>> = {
    [AiToolId.KLING]: [...UI_ASPECT_RATIOS],
    [AiToolId.VEO]: [...UI_ASPECT_RATIOS],
    [AiToolId.SORA]: [...UI_ASPECT_RATIOS],
    [AiToolId.SEEDANCE]: [...UI_ASPECT_RATIOS],
    [AiToolId.HIGGSFIELD]: [...UI_ASPECT_RATIOS],
    [AiToolId.HEYGEN]: [...UI_ASPECT_RATIOS],
};

export const STATIC_VIDEO_RESOLUTIONS: Partial<Record<AiToolId, string[]>> = {
    [AiToolId.SORA]: ['720p', '1080p'],
    [AiToolId.SEEDANCE]: ['720p', '1080p'],
    [AiToolId.HIGGSFIELD]: ['720p'],
    [AiToolId.HEYGEN]: ['720p', '1080p'],
};

export function isVideoFlowTool(toolId: AiToolId): boolean {
    return VIDEO_FLOW_TOOLS.includes(toolId);
}

export function isVideoToolWithReferences(toolId: AiToolId): boolean {
    return VIDEO_TOOLS_WITH_REFERENCES.includes(toolId);
}

export function isVideoToolWithAspectSettings(toolId: AiToolId): boolean {
    return VIDEO_TOOLS_WITH_ASPECT_SETTINGS.includes(toolId);
}

export function getVideoMaxReferences(toolId: AiToolId): number {
    return VIDEO_TOOL_MAX_REFERENCES[toolId] ?? 0;
}

export function getOpenRouterVideoModelForTool(
    toolId: AiToolId,
): string | undefined {
    return getToolById(toolId)?.model;
}

export function buildModelNativeStyleOptions(
    modelSlug: string,
    allowedPassthrough: string[],
): VideoStyleOption[] {
    const options: VideoStyleOption[] = [];

    for (const param of allowedPassthrough) {
        if (!MODEL_STYLE_PASSTHROUGH_PARAMS.has(param)) {
            continue;
        }

        const enums = MODEL_PASSTHROUGH_STYLE_ENUMS[modelSlug]?.[param] ?? [];
        for (const entry of enums) {
            options.push({
                id: `model:${param}:${entry.value}`,
                source: 'model',
                labelRu: entry.labelRu,
                labelEn: entry.labelEn,
                passthrough: { [param]: entry.value },
            });
        }
    }

    return options;
}

export function getVideoStyleLabel(
    styleId: string,
    locale: 'ru-RU' | 'en-US',
    options?: VideoStyleOption[],
): string {
    const fromList = options?.find((option) => option.id === styleId);
    if (fromList) {
        return locale === 'ru-RU' ? fromList.labelRu : fromList.labelEn;
    }

    const builtin = BUILTIN_VIDEO_STYLE_PRESETS.find(
        (preset) => preset.id === styleId,
    );
    if (builtin) {
        return locale === 'ru-RU' ? builtin.labelRu : builtin.labelEn;
    }

    return locale === 'ru-RU' ? 'Без стиля' : 'No style';
}

export function resolveVideoStyleOption(
    toolId: AiToolId,
    styleId: string | undefined,
    styleOptions: VideoStyleOption[],
): VideoStyleOption {
    const fallback =
        styleOptions.find((option) => option.id === 'none') ??
        BUILTIN_VIDEO_STYLE_PRESETS[0];

    if (!styleId) {
        return fallback;
    }

    return styleOptions.find((option) => option.id === styleId) ?? fallback;
}

/** @deprecated Use resolveVideoStyleOption */
export function getVideoStylePreset(styleId?: string): VideoStyleOption {
    return (
        BUILTIN_VIDEO_STYLE_PRESETS.find((preset) => preset.id === styleId) ??
        BUILTIN_VIDEO_STYLE_PRESETS[0]
    );
}
