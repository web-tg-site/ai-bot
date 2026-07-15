import { I18nBundle } from '../i18n/types';

export enum BotErrorCode {
    UNKNOWN = 1,
    INSUFFICIENT_TOKENS = 2,
    CONFIG = 10,
    TIMEOUT = 11,
    PROVIDER = 12,
    DELIVERY = 13,
    POLL = 14,
}

export function stripTechnicalErrorDetails(message: string): string {
    return message.split('\n\nID запроса:')[0].trim();
}

export function classifyBotError(rawMessage: string): BotErrorCode {
    const message = stripTechnicalErrorDetails(rawMessage);

    if (message === 'INSUFFICIENT_TOKENS') {
        return BotErrorCode.INSUFFICIENT_TOKENS;
    }

    if (
        /timed out|превысила максимальное время|generation timed out/i.test(
            message,
        )
    ) {
        return BotErrorCode.TIMEOUT;
    }

    if (/Не удалось отправить результат|delivery failed/i.test(message)) {
        return BotErrorCode.DELIVERY;
    }

    if (/Не удалось проверить статус/i.test(message)) {
        return BotErrorCode.POLL;
    }

    if (/not configured|API_KEY|Model not configured/i.test(message)) {
        return BotErrorCode.CONFIG;
    }

    if (
        /Sharpii|Topaz|Midjourney|Higgsfield|OpenRouter|ElevenLabs|HeyGen|Suno|HTTP \d+|provider|generation failed|Insufficient credits|Image generation failed/i.test(
            message,
        )
    ) {
        return BotErrorCode.PROVIDER;
    }

    return BotErrorCode.UNKNOWN;
}

function containsProviderLeak(message: string): boolean {
    return /Sharpii|Topaz|Higgsfield|OpenRouter|ElevenLabs|HeyGen|Suno|openrouter|sharpii|elevenlabs/i.test(
        message,
    );
}

function isUserFriendlyMessage(message: string): boolean {
    const stripped = stripTechnicalErrorDetails(message);

    if (containsProviderLeak(stripped)) {
        return false;
    }

    if (
        /^(AxiosError|Error:|TypeError|SyntaxError|HTTP \d+|Unknown error|Неизвестная ошибка|generation failed|Video generation failed|Dubbing failed)$/i.test(
            stripped,
        )
    ) {
        return false;
    }

    if (/[а-яА-ЯёЁ]/.test(stripped) && stripped.length > 15) {
        return true;
    }

    if (
        /try again|please try|Попробуйте|Недостаточно|недоступен|недоступна|стороне провайдера/i.test(
            stripped,
        )
    ) {
        return true;
    }

    return false;
}

export function formatUserBotError(error: unknown, i18n: I18nBundle): string {
    const rawMessage =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Unknown error';

    if (rawMessage === 'INSUFFICIENT_TOKENS') {
        return i18n.aiResult.insufficientTokens;
    }

    const code = classifyBotError(rawMessage);
    const defaultMessage =
        i18n.aiResult.errorByCode[code] ?? i18n.aiResult.errorByCode[1];
    const detail = isUserFriendlyMessage(rawMessage)
        ? stripTechnicalErrorDetails(rawMessage)
        : defaultMessage;

    return i18n.aiResult.errorWithCode(code, detail);
}

export function formatUserBotErrorMessage(
    rawMessage: string,
    i18n: I18nBundle,
): string {
    return formatUserBotError(new Error(rawMessage), i18n);
}
