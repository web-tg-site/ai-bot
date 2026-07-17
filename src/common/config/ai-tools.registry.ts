import {
    AiInputType,
    AiProviderId,
    AiToolCategory,
    AiToolId,
} from '@/common/services/ai/types';
import { calculateTopazTokenCost } from '@/common/config/image-editor-capabilities.config';
import {
    applyImageCostMultipliers,
    applyVideoCostMultipliers,
} from '@/common/config/token-cost-multipliers.config';
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
        id: AiToolId.CLAUDE_SONNET,
        label: 'Claude Sonnet',
        category: 'text',
        provider: AiProviderId.OPENROUTER,
        model: 'anthropic/claude-sonnet-4.6',
        baseTokenCost: 3,
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
        accepts: ['text', 'photo'],
        isAsync: false,
        instruction:
            'Опишите задачу и при желании добавьте референсы (до 10 изображений). Чем точнее вы укажете роль каждого изображения, тем предсказуемее будет результат.',
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
            'Опишите задачу и при желании добавьте референсы (до 10 изображений). Чем точнее вы укажете роль каждого изображения, тем предсказуемее будет результат.',
    },
    {
        id: AiToolId.NANO_BANANA,
        label: 'Nano Banana',
        category: 'image',
        provider: AiProviderId.SHARPII,
        model: 'nano-banana-2',
        baseTokenCost: 20,
        accepts: ['text', 'photo'],
        isAsync: true,
        instruction:
            'Опишите задачу и при желании добавьте референсы (до 4 изображений). Чем точнее вы укажете роль каждого изображения, тем предсказуемее будет результат.',
    },
    {
        id: AiToolId.SEEDREAM,
        label: 'Seedream',
        category: 'image',
        provider: AiProviderId.OPENROUTER,
        model: 'bytedance-seed/seedream-4.5',
        baseTokenCost: 20,
        accepts: ['text', 'photo'],
        isAsync: false,
        instruction:
            'Опишите задачу и при желании добавьте референсы (до 10 изображений). Чем точнее вы укажете роль каждого изображения, тем предсказуемее будет результат.',
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
        instruction: 'Отправьте промпт для генерации изображения.',
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
            'Загрузите референсы (можно пропустить), настройте параметры и опишите сцену.',
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
            'Загрузите референсы (можно пропустить), настройте параметры и опишите сцену.',
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
        instruction:
            'Загрузите до 2 кадров для перехода, настройте параметры и опишите сцену.',
    },
    {
        id: AiToolId.SEEDANCE,
        label: 'Seedance',
        category: 'video',
        provider: AiProviderId.SHARPII,
        model: 'seedance-2.0-720p',
        baseTokenCost: 0,
        perSecondCost: 34,
        defaultDurationSeconds: 5,
        accepts: ['text', 'photo'],
        isAsync: true,
        instruction:
            'Загрузите до 2 кадров для перехода, настройте параметры и опишите сцену.',
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
        instruction:
            'Загрузите референс (можно пропустить), настройте параметры и опишите сцену.',
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
            'Настройте параметры и отправьте текст сценария для видео с аватаром.',
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
            'Опишите именно звук, а не сцену (например: «стук каблуков по металлу», «громкий гром», «шаги по гравию»).',
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
    AI_TOOLS_REGISTRY.filter(
        (tool) =>
            tool.category === category ||
            (category === 'image' && tool.id === AiToolId.TOPAZ),
    );

export type ToolCostOptions = {
    durationSeconds?: number;
    topazScale?: number;
    quality?: string;
    resolution?: string;
};

export const calculateToolTokenCost = (
    tool: AiToolConfig,
    options?: ToolCostOptions | number,
): number => {
    const normalized: ToolCostOptions =
        typeof options === 'number'
            ? { durationSeconds: options }
            : (options ?? {});

    if (tool.id === AiToolId.TOPAZ) {
        const scale = normalized.topazScale ?? 2;
        return calculateTopazTokenCost(tool.baseTokenCost, scale);
    }

    if (tool.perSecondCost) {
        const duration =
            normalized.durationSeconds ?? tool.defaultDurationSeconds ?? 5;
        const baseCost = tool.baseTokenCost + tool.perSecondCost * duration;
        return applyVideoCostMultipliers(tool.id, baseCost, {
            resolution: normalized.resolution,
            quality: normalized.quality,
        });
    }

    if (tool.category === 'image') {
        return applyImageCostMultipliers(tool.id, tool.baseTokenCost, {
            resolution: normalized.resolution,
            quality: normalized.quality,
        });
    }

    return tool.baseTokenCost;
};
