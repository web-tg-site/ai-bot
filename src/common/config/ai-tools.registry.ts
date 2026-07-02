import {
    AiInputType,
    AiProviderId,
    AiToolCategory,
    AiToolId,
} from '@/common/services/ai/types';
import { ru } from '@/common/services/bot/i18n/locales/ru';
import { en } from '@/common/services/bot/i18n/locales/en';

export type AiToolConfig = {
    id: AiToolId;
    label: string;
    category: AiToolCategory;
    provider: AiProviderId;
    model?: string;
    baseTokenCost: number;
    perSecondCost?: number;
    defaultDurationSeconds?: number;
    accepts: AiInputType[];
    isAsync: boolean;
    instruction: string;
};

export const AI_TOOLS_REGISTRY: AiToolConfig[] = [
    {
        id: AiToolId.GPT,
        label: 'GPT',
        category: 'text',
        provider: AiProviderId.OPENROUTER,
        baseTokenCost: 1,
        accepts: ['text', 'photo', 'document', 'video'],
        isAsync: false,
        instruction: 'Отправьте текст, фото, файл или видео.',
    },
    {
        id: AiToolId.GPT_IMAGES,
        label: 'GPT Images',
        category: 'image',
        provider: AiProviderId.OPENROUTER,
        model: 'openai/gpt-5-image-mini',
        baseTokenCost: 40,
        accepts: ['text'],
        isAsync: false,
        instruction: 'Отправьте текстовый промпт для генерации изображения.',
    },
    {
        id: AiToolId.FLUX,
        label: 'Flux',
        category: 'image',
        provider: AiProviderId.OPENROUTER,
        model: 'black-forest-labs/flux.2-pro',
        baseTokenCost: 15,
        accepts: ['text', 'photo'],
        isAsync: false,
        instruction:
            'Отправьте текстовый промпт или фото с описанием для генерации изображения.',
    },
    {
        id: AiToolId.NANO_BANANA,
        label: 'Nano Banana',
        category: 'image',
        provider: AiProviderId.OPENROUTER,
        model: 'google/gemini-2.5-flash-image',
        baseTokenCost: 20,
        accepts: ['text', 'photo'],
        isAsync: false,
        instruction: 'Отправьте текстовый промпт для генерации изображения.',
    },
    {
        id: AiToolId.SEEDREAM,
        label: 'Seedream 4.5',
        category: 'image',
        provider: AiProviderId.OPENROUTER,
        model: 'bytedance-seed/seedream-4.5',
        baseTokenCost: 20,
        accepts: ['text', 'photo'],
        isAsync: false,
        instruction: 'Отправьте текстовый промпт для генерации изображения.',
    },
    {
        id: AiToolId.MIDJOURNEY,
        label: 'Midjourney',
        category: 'image',
        provider: AiProviderId.SHARPII,
        model: 'mj-imagine',
        baseTokenCost: 30,
        accepts: ['text'],
        isAsync: true,
        instruction: 'Отправьте текстовый промпт для генерации изображения.',
    },
    {
        id: AiToolId.KLING,
        label: 'Kling',
        category: 'video',
        provider: AiProviderId.OPENROUTER,
        model: 'kwaivgi/kling-v3.0-std',
        baseTokenCost: 0,
        perSecondCost: 63,
        defaultDurationSeconds: 5,
        accepts: ['text', 'photo'],
        isAsync: true,
        instruction:
            'Отправьте текстовый промпт или фото для генерации видео (5 сек).',
    },
    {
        id: AiToolId.VEO,
        label: 'Veo',
        category: 'video',
        provider: AiProviderId.OPENROUTER,
        model: 'google/veo-3.1-lite',
        baseTokenCost: 0,
        perSecondCost: 25,
        defaultDurationSeconds: 6,
        accepts: ['text', 'photo'],
        isAsync: true,
        instruction:
            'Отправьте текстовый промпт или фото для генерации видео (6 сек).',
    },
    {
        id: AiToolId.SORA,
        label: 'Sora',
        category: 'video',
        provider: AiProviderId.SHARPII,
        model: 'sora-2',
        baseTokenCost: 0,
        perSecondCost: 150,
        defaultDurationSeconds: 10,
        accepts: ['text', 'photo'],
        isAsync: true,
        instruction: 'Отправьте текстовый промпт для генерации видео (10 сек).',
    },
    {
        id: AiToolId.SEEDANCE,
        label: 'Seedance 2.0',
        category: 'video',
        provider: AiProviderId.SHARPII,
        model: 'seedance-2.0-720p',
        baseTokenCost: 0,
        perSecondCost: 34,
        defaultDurationSeconds: 5,
        accepts: ['text', 'photo'],
        isAsync: true,
        instruction: 'Отправьте текстовый промпт для генерации видео (5 сек).',
    },
    {
        id: AiToolId.HIGGSFIELD,
        label: 'Higgsfield',
        category: 'video',
        provider: AiProviderId.HIGGSFIELD,
        baseTokenCost: 0,
        perSecondCost: 15,
        defaultDurationSeconds: 5,
        accepts: ['text', 'photo'],
        isAsync: true,
        instruction: 'Отправьте текстовый промпт для генерации видео (5 сек).',
    },
    {
        id: AiToolId.HEYGEN,
        label: 'HeyGen',
        category: 'video',
        provider: AiProviderId.HEYGEN,
        baseTokenCost: 0,
        perSecondCost: 25,
        defaultDurationSeconds: 5,
        accepts: ['text'],
        isAsync: true,
        instruction:
            'Отправьте текст сценария для генерации видео с аватаром (5 сек).',
    },
    {
        id: AiToolId.TOPAZ,
        label: 'Topaz AI',
        category: 'video',
        provider: AiProviderId.TOPAZ,
        baseTokenCost: 40,
        accepts: ['video', 'photo'],
        isAsync: true,
        instruction:
            'Отправьте видео или фото для улучшения качества (апскейл).',
    },
    {
        id: AiToolId.ELEVENLABS_VOICE,
        label: 'ElevenLAbs Voice',
        category: 'audio',
        provider: AiProviderId.ELEVENLABS,
        baseTokenCost: 40,
        accepts: ['text'],
        isAsync: false,
        instruction:
            'Отправьте текст — бот озвучит его дословно (до 5000 символов).',
    },
    {
        id: AiToolId.VOICE_CLONE,
        label: 'Клонирование голоса',
        category: 'audio',
        provider: AiProviderId.ELEVENLABS,
        baseTokenCost: 50,
        accepts: ['text', 'voice', 'audio'],
        isAsync: false,
        instruction:
            '<b>Шаг 1:</b> отправьте голосовое или аудиофайл (образец голоса).\n' +
            '<b>Шаг 2:</b> отправьте текст — бот озвучит его этим голосом.',
    },
    {
        id: AiToolId.VIDEO_TO_AUDIO,
        label: 'Озвучка видео',
        category: 'audio',
        provider: AiProviderId.ELEVENLABS,
        baseTokenCost: 60,
        perSecondCost: 5,
        defaultDurationSeconds: 10,
        accepts: ['video', 'audio'],
        isAsync: true,
        instruction:
            'Отправьте видео или аудиофайл. Бот сделает дубляж на русский (или укажите язык в подписи: en, es, de…).',
    },
    {
        id: AiToolId.SOUND_GENERATOR,
        label: 'Генерация звуков',
        category: 'audio',
        provider: AiProviderId.ELEVENLABS,
        baseTokenCost: 60,
        accepts: ['text'],
        isAsync: false,
        instruction:
            'Опишите звук или звуковой эффект (например: «громкий гром», «шаги по гравию», «космический whoosh»).',
    },
];

export const getToolById = (id: AiToolId): AiToolConfig | undefined =>
    AI_TOOLS_REGISTRY.find((t) => t.id === id);

export const getToolByLabel = (label: string): AiToolConfig | undefined => {
    for (const tool of AI_TOOLS_REGISTRY) {
        if (
            ru.tools.labels[tool.id] === label ||
            en.tools.labels[tool.id] === label
        ) {
            return tool;
        }
    }
    return undefined;
};

export const getToolsByCategory = (category: AiToolCategory): AiToolConfig[] =>
    AI_TOOLS_REGISTRY.filter((t) => t.category === category);

export const calculateToolTokenCost = (
    tool: AiToolConfig,
    durationSeconds?: number,
): number => {
    if (tool.perSecondCost) {
        const duration = durationSeconds ?? tool.defaultDurationSeconds ?? 5;
        return tool.baseTokenCost + tool.perSecondCost * duration;
    }
    return tool.baseTokenCost;
};
