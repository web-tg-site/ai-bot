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
        /Sharpii|Apiframe|Topaz|Midjourney|Higgsfield|OpenRouter|ElevenLabs|HeyGen|Suno|Gemini|BFL|Luma|Kling|BytePlus|HTTP \d+|provider|generation failed|Insufficient credits|Image generation failed/i.test(
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

const PROVIDER_NAME_PREFIX =
    /^(?:Kling(?:\s+API)?|BytePlus|Sharpii|Apiframe|Topaz|Midjourney|Higgsfield|OpenRouter|ElevenLabs|HeyGen|Suno|Gemini|BFL|Luma|OpenAI(?:\s+Sora)?)\s*:\s*/i;

const PROVIDER_NAME_LEAK =
    /Sharpii|Apiframe|Topaz|Higgsfield|OpenRouter|ElevenLabs|HeyGen|Suno|Gemini|Google|BFL|Luma|Kling|BytePlus|openrouter|sharpii|apiframe|elevenlabs|kling|generativelanguage/i;

function stripProviderPrefix(message: string): string {
    return message.replace(PROVIDER_NAME_PREFIX, '').trim();
}

function containsProviderLeak(message: string): boolean {
    return PROVIDER_NAME_LEAK.test(message);
}

function isRussianI18n(i18n: I18nBundle): boolean {
    return Boolean(i18n.aiResult.errorByCode[12]?.includes('провайдера'));
}

/** Readable validation / constraint messages from providers (after stripping brand). */
function isActionableProviderDetail(detail: string): boolean {
    if (detail.length < 12 || detail.length > 320) {
        return false;
    }

    if (
        /^(AxiosError|Error:|TypeError|SyntaxError|HTTP \d+|Unknown error|Неизвестная ошибка|generation failed|Video generation failed|Dubbing failed|request failed)$/i.test(
            detail,
        )
    ) {
        return false;
    }

    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|stack trace|at\s+\w+\s+\(/i.test(detail)) {
        return false;
    }

    if (
        /duration|longer than|shorter than|seconds|\d+(?:\.\d+)?\s*s\b|file size|too large|too small|resolution|aspect|format|invalid|must be|cannot|can not|can't|required|upload|orientation|fps|frame|dimension|width|height|mb\b|minutes?/i.test(
            detail,
        )
    ) {
        return true;
    }

    // Short English sentence without brand names
    const words = detail.split(/\s+/).filter(Boolean);
    return words.length >= 4 && !containsProviderLeak(detail);
}

function localizeActionableProviderDetail(
    detail: string,
    i18n: I18nBundle,
): string {
    const ru = isRussianI18n(i18n);

    const maxMatch = detail.match(
        /(?:duration[^\d]{0,40})?(?:can\s*not|cannot|can't|must\s+not|not\s+(?:be\s+)?(?:longer|greater|more)|exceed(?:s|ed)?|max(?:imum)?(?:\s+of)?)\s*([\d.]+)\s*s(?:ec(?:onds?)?)?/i,
    ) ?? detail.match(/longer than\s*([\d.]+)\s*s/i);
    if (
        maxMatch?.[1] &&
        /duration|longer|exceed|max|video/i.test(detail)
    ) {
        const sec = maxMatch[1].replace(/\.0$/, '');
        if (sec === '10') {
            return ru
                ? `Режим «Поза с фото»: видео движения должно быть короче 10 секунд (ровно 10 часто не проходит). Выбери «Поза из видео» (до 30 сек) или обрежь клип.`
                : `“Pose from photo” mode: motion video must be under 10 seconds (exactly 10s often fails). Switch to “Pose from video” (up to 30s) or trim the clip.`;
        }
        return ru
            ? `Длительность видео не должна превышать ${sec} с. Сократите клип и попробуйте снова.`
            : `Video duration must not exceed ${sec}s. Shorten the clip and try again.`;
    }

    const minMatch = detail.match(
        /(?:duration[^\d]{0,40})?(?:can\s*not|cannot|can't|must\s+not|not\s+(?:be\s+)?(?:shorter|less)|at\s+least|min(?:imum)?(?:\s+of)?)\s*([\d.]+)\s*s(?:ec(?:onds?)?)?/i,
    ) ?? detail.match(/shorter than\s*([\d.]+)\s*s/i);
    if (
        minMatch?.[1] &&
        /duration|shorter|least|min|video/i.test(detail)
    ) {
        const sec = minMatch[1].replace(/\.0$/, '');
        return ru
            ? `Длительность видео должна быть не меньше ${sec} с. Загрузите более длинный клип.`
            : `Video duration must be at least ${sec}s. Upload a longer clip.`;
    }

    if (
            /copyright|trademark|intellectual property|\bip\b|third[- ]party|franchis|licensed character|real person|public figure|famous/i.test(
                detail,
            )
        ) {
            return ru
                ? 'Sora не принимает известных персонажей из фильмов и игр. Используйте свой оригинальный персонаж или объект.'
                : 'Sora rejects well-known film/game characters. Use your own original character or object.';
        }

    if (
        /unsupported video format|accepted inputs:\s*mp4|h\.?264|hevc|h\.?265|video\/quicktime|codec not supported/i.test(
            detail,
        )
    ) {
        return ru
            ? 'Формат видео не подходит. Загрузите MP4 или MOV — мы автоматически перекодируем клипы с iPhone.'
            : 'Unsupported video format. Upload MP4 or MOV — iPhone clips are converted automatically.';
    }

    if (/heic|heif|не удалось обработать heic/i.test(detail)) {
        return ru
            ? 'Не удалось обработать фото с iPhone (HEIC). Попробуйте ещё раз или сохраните снимок как JPEG.'
            : 'Could not process the iPhone HEIC photo. Try again or save it as JPEG.';
    }

    if (/не удалось подготовить видео/i.test(detail)) {
        return ru
            ? 'Не удалось подготовить видео. Загрузите клип в MP4 или MOV и попробуйте снова.'
            : 'Could not prepare the video. Upload an MP4 or MOV clip and try again.';
    }

    // Keep other actionable details, but never leak provider brand names.
    return stripProviderPrefix(detail);
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

    if (/Request failed with status code|status code 422|HTTP 422/i.test(message)) {
        return i18n.aiResult.userErrors.generationFailed;
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

    const providerDetail = stripProviderPrefix(stripped);
    if (
        providerDetail &&
        providerDetail !== stripped &&
        isActionableProviderDetail(providerDetail)
    ) {
        return localizeActionableProviderDetail(providerDetail, i18n);
    }

    if (
        !containsProviderLeak(stripped) &&
        isActionableProviderDetail(stripped)
    ) {
        return localizeActionableProviderDetail(stripped, i18n);
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
