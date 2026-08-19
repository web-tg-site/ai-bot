import { I18nBundle } from '../i18n/types';
import { ru } from '../i18n/locales/ru';

export enum BotErrorCode {
    UNKNOWN = 1,
    INSUFFICIENT_TOKENS = 2,
    CONFIG = 10,
    TIMEOUT = 11,
    PROVIDER = 12,
    DELIVERY = 13,
    POLL = 14,
    CONTENT_POLICY = 15,
}

const SAFETY_REASON_TO_KEY = {
    PROHIBITED_CONTENT: 'prohibitedContent',
    SEXUALLY_EXPLICIT: 'sexuallyExplicit',
    HATE_SPEECH: 'hateSpeech',
    HARASSMENT: 'harassment',
    DANGEROUS_CONTENT: 'dangerousContent',
    CIVIC_INTEGRITY: 'civicIntegrity',
    IMAGE_SAFETY: 'imageSafety',
    SAFETY: 'safetyBlocked',
    OTHER: 'safetyBlocked',
    BLOCKED_REASON_UNSPECIFIED: 'safetyBlocked',
} as const satisfies Record<string, keyof I18nBundle['aiResult']['userErrors']>;

const SAFETY_REASON_PATTERN = new RegExp(
    Object.keys(SAFETY_REASON_TO_KEY).join('|'),
    'i',
);

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

    if (isContentPolicyMessage(message)) {
        return BotErrorCode.CONTENT_POLICY;
    }

    if (
        /Sharpii|Topaz|Midjourney|Higgsfield|OpenRouter|ElevenLabs|HeyGen|Suno|Gemini|BFL|Luma|HTTP \d+|provider|generation failed|Insufficient credits|Image generation failed/i.test(
            message,
        )
    ) {
        return BotErrorCode.PROVIDER;
    }

    return BotErrorCode.UNKNOWN;
}

function isContentPolicyMessage(message: string): boolean {
    return (
        SAFETY_REASON_PATTERN.test(message) ||
        /blocked the request|blocked by|content policy|safety filter|moderation/i.test(
            message,
        )
    );
}

function containsProviderLeak(message: string): boolean {
    return /Sharpii|Topaz|Higgsfield|OpenRouter|ElevenLabs|HeyGen|Suno|Gemini|BFL|Luma|openrouter|sharpii|elevenlabs/i.test(
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
        /try again|please try|Попробуйте|Недостаточно|недоступен|недоступна|стороне провайдера|Sora отклонила|OpenAI Sora/i.test(
            stripped,
        )
    ) {
        return true;
    }

    return false;
}

function matchSafetyError(
    message: string,
    i18n: I18nBundle,
): string | undefined {
    const parenMatch = message.match(/\(([A-Z_]+)\)/);
    const fromParen = parenMatch?.[1]?.toUpperCase();
    if (fromParen && fromParen in SAFETY_REASON_TO_KEY) {
        const key =
            SAFETY_REASON_TO_KEY[
                fromParen as keyof typeof SAFETY_REASON_TO_KEY
            ];
        return i18n.aiResult.userErrors[key];
    }

    const bareMatch = message.match(SAFETY_REASON_PATTERN);
    const fromBare = bareMatch?.[0]?.toUpperCase();
    if (fromBare && fromBare in SAFETY_REASON_TO_KEY) {
        const key =
            SAFETY_REASON_TO_KEY[fromBare as keyof typeof SAFETY_REASON_TO_KEY];
        return i18n.aiResult.userErrors[key];
    }

    if (
        /blocked the request|blocked by|safety filter|content policy|moderation/i.test(
            message,
        )
    ) {
        if (/content policy/i.test(message)) {
            return i18n.aiResult.userErrors.contentPolicy;
        }
        return i18n.aiResult.userErrors.safetyBlocked;
    }

    return undefined;
}

function matchKnownFallback(
    message: string,
    i18n: I18nBundle,
): string | undefined {
    if (
        /rate.?limit|too many requests|quota exceeded|insufficient quota|HTTP 429/i.test(
            message,
        )
    ) {
        return i18n.aiResult.userErrors.rateLimit;
    }

    if (/Voice preview failed/i.test(message)) {
        return i18n.aiResult.userErrors.voicePreviewFailed;
    }

    if (/Send failed/i.test(message)) {
        return i18n.aiResult.userErrors.sendFailed;
    }

    if (/Media download failed/i.test(message)) {
        return i18n.aiResult.userErrors.mediaDownloadFailed;
    }

    if (/Failed to create invoice/i.test(message)) {
        return i18n.aiResult.userErrors.invoiceFailed;
    }

    if (/Failed to create checkout/i.test(message)) {
        return i18n.aiResult.userErrors.checkoutFailed;
    }

    if (/generation failed/i.test(message)) {
        return i18n.aiResult.userErrors.generationFailed;
    }

    return undefined;
}

export function toUserFacingError(
    rawMessage: string,
    i18n: I18nBundle = ru,
): string {
    const stripped = stripTechnicalErrorDetails(rawMessage);

    if (!stripped) {
        return i18n.aiResult.errorByCode[BotErrorCode.UNKNOWN];
    }

    if (stripped === 'INSUFFICIENT_TOKENS') {
        return i18n.aiResult.insufficientTokens;
    }

    if (stripped === 'NO_SUBSCRIPTION') {
        return i18n.aiResult.noSubscription;
    }

    const safety = matchSafetyError(stripped, i18n);
    if (safety) {
        return safety;
    }

    const known = matchKnownFallback(stripped, i18n);
    if (known) {
        return known;
    }

    if (isUserFriendlyMessage(stripped)) {
        return stripped;
    }

    const code = classifyBotError(stripped);
    return i18n.aiResult.errorByCode[code] ?? i18n.aiResult.errorByCode[1];
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
    const detail = toUserFacingError(rawMessage, i18n);

    return i18n.aiResult.errorWithCode(code, detail);
}

export function formatUserBotErrorMessage(
    rawMessage: string,
    i18n: I18nBundle,
): string {
    return formatUserBotError(new Error(rawMessage), i18n);
}
