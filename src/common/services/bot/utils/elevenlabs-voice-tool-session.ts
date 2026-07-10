import { Context } from 'telegraf';
import { AiService, AiToolId, BotSession } from '@/common/services/ai';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import {
    ElevenLabsVoiceOption,
    getDefaultElevenLabsVoiceId,
} from '@/common/config/elevenlabs-voices.config';
import { I18nBundle } from '../i18n';
import {
    generateElevenLabsVoiceReplyKeyboard,
    VoiceKeyboardMode,
} from '../keyboards/voice.keyboard';

type BotContext = Context & { session: BotSession };

export async function loadVoiceToolSettings(
    userId: string,
    toolId: AiToolId,
    settingsService: UserAiToolSettingsModelService,
): Promise<VoiceToolSettings> {
    const stored = await settingsService.getVoiceSettings(userId, toolId);
    return {
        elevenLabsVoiceId:
            stored.elevenLabsVoiceId ?? getDefaultElevenLabsVoiceId(),
    };
}

export function getVoiceKeyboardMode(session: BotSession): VoiceKeyboardMode {
    return session.ai?.voiceKeyboardMode ?? 'main';
}

export function getSessionAccessibleVoices(
    session: BotSession,
): ElevenLabsVoiceOption[] {
    return session.ai?.accessibleElevenLabsVoices ?? [];
}

export async function ensureAccessibleElevenLabsVoices(
    session: BotSession,
    aiService: AiService,
): Promise<ElevenLabsVoiceOption[]> {
    const cached = getSessionAccessibleVoices(session);
    if (cached.length) {
        return cached;
    }

    const voices = await aiService.listAccessibleElevenLabsVoices();
    if (session.ai) {
        session.ai.accessibleElevenLabsVoices = voices;
    }
    return voices;
}

export function buildElevenLabsVoiceReplyKeyboard(
    i18n: I18nBundle,
    options: {
        settings: VoiceToolSettings;
        keyboardMode?: VoiceKeyboardMode;
        localeTag: 'ru-RU' | 'en-US';
        voices: ElevenLabsVoiceOption[];
    },
) {
    return generateElevenLabsVoiceReplyKeyboard(i18n, {
        settings: options.settings,
        keyboardMode: options.keyboardMode ?? 'main',
        localeTag: options.localeTag,
        voices: options.voices,
    });
}

export async function replyWithElevenLabsVoiceKeyboard(
    ctx: BotContext,
    session: BotSession,
    i18n: I18nBundle,
    options?: {
        text?: string;
        keyboardMode?: VoiceKeyboardMode;
        settings?: VoiceToolSettings;
        voices?: ElevenLabsVoiceOption[];
    },
) {
    const settings = options?.settings ?? session.ai?.voiceToolSettings ?? {};
    const voices = options?.voices ?? getSessionAccessibleVoices(session);

    const keyboard = buildElevenLabsVoiceReplyKeyboard(i18n, {
        settings,
        keyboardMode: options?.keyboardMode ?? getVoiceKeyboardMode(session),
        localeTag: i18n.localeTag,
        voices,
    });

    if (options?.text) {
        await ctx.reply(options.text, {
            ...keyboard,
            parse_mode: 'HTML',
        });
        return;
    }

    await ctx.reply(
        i18n.voiceTool.keyboardUpdated(i18n.tools.labels.elevenlabs_voice),
        {
            ...keyboard,
        },
    );
}
