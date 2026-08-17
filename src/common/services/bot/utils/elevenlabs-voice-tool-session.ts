import { Context } from 'telegraf';
import { AiService, AiToolId, BotSession } from '@/common/services/ai';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import {
    ElevenLabsVoiceOption,
    getDefaultElevenLabsVoiceId,
} from '@/common/config/elevenlabs-voices.config';
import {
    normalizeSunoDuration,
    normalizeSunoGenreId,
    normalizeSunoMoodId,
} from '@/common/config/suno-audio.config';
import { normalizeSoundGeneratorDuration } from '@/common/config/sound-generator.config';
import { I18nBundle, getToolInstruction, getToolLabel } from '../i18n';
import { UserLanguage } from '@/generated/prisma/enums';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';
import { replyHtmlChunks } from './telegram-html-reply';
import {
    generateElevenLabsVoiceReplyKeyboard,
    getVoiceLabelById,
    VoiceKeyboardMode,
} from '../keyboards/voice.keyboard';

type BotContext = Context & { session: BotSession };

export async function loadVoiceToolSettings(
    userId: string,
    toolId: AiToolId,
    settingsService: UserAiToolSettingsModelService,
): Promise<VoiceToolSettings> {
    const stored = await settingsService.getVoiceSettings(userId, toolId);
    const settings: VoiceToolSettings = {
        elevenLabsVoiceId:
            stored.elevenLabsVoiceId ?? getDefaultElevenLabsVoiceId(),
        sendAsFile: stored.sendAsFile,
        durationSeconds: stored.durationSeconds,
    };

    if (toolId === AiToolId.SUNO) {
        settings.durationSeconds = normalizeSunoDuration(
            stored.durationSeconds,
        );
        settings.sunoGenreId = normalizeSunoGenreId(stored.sunoGenreId);
        settings.sunoMoodId = normalizeSunoMoodId(stored.sunoMoodId);
        settings.sunoInstrumental = Boolean(stored.sunoInstrumental);
        settings.sunoLyrics = stored.sunoLyrics?.trim() || undefined;
    }

    if (toolId === AiToolId.SOUND_GENERATOR) {
        settings.durationSeconds = normalizeSoundGeneratorDuration(
            stored.durationSeconds,
        );
    }

    return settings;
}

export function getVoiceKeyboardMode(session: BotSession): VoiceKeyboardMode {
    const mode = session.ai?.voiceKeyboardMode ?? 'main';
    if (
        mode === 'main' ||
        mode === 'settings' ||
        mode === 'preview' ||
        mode === 'duration' ||
        mode === 'gender'
    ) {
        return mode;
    }
    return 'main';
}

export function buildElevenLabsVoiceMainScreenText(
    i18n: I18nBundle,
    language: UserLanguage | null | undefined,
    settings: VoiceToolSettings,
    voices: ElevenLabsVoiceOption[],
): string {
    const label = getToolLabel(AiToolId.ELEVENLABS_VOICE, language);
    const instruction = getToolInstruction(AiToolId.ELEVENLABS_VOICE, language);
    const voiceName = getVoiceLabelById(
        settings.elevenLabsVoiceId ?? '',
        i18n.localeTag,
        voices,
    );

    return [
        i18n.aiResult.toolSelected(label, instruction),
        i18n.voiceTool.voiceLine(voiceName),
        i18n.voiceTool.deliveryLine(
            resolveVoiceSendAsFile(AiToolId.ELEVENLABS_VOICE, settings),
        ),
    ].join('\n\n');
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
        genderFilter?: 'Женский' | 'Мужской';
    },
) {
    return generateElevenLabsVoiceReplyKeyboard(i18n, {
        settings: options.settings,
        keyboardMode: options.keyboardMode ?? 'main',
        localeTag: options.localeTag,
        voices: options.voices,
        genderFilter: options.genderFilter,
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
        genderFilter: session.ai?.elevenLabsVoiceGender,
    });

    if (options?.text) {
        await replyHtmlChunks(ctx, options.text, keyboard);
        return;
    }

    await replyHtmlChunks(
        ctx,
        buildElevenLabsVoiceMainScreenText(i18n, i18n.lang, settings, voices),
        keyboard,
    );
}
