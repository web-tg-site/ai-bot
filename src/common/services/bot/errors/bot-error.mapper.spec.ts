import {
    BotErrorCode,
    classifyBotError,
    toUserFacingError,
    formatUserBotError,
    formatUserBotErrorMessage,
    stripTechnicalErrorDetails,
} from './bot-error.mapper';
import { ru } from '../i18n/locales/ru';
import { en } from '../i18n/locales/en';

describe('bot-error.mapper', () => {
    describe('stripTechnicalErrorDetails', () => {
        it('removes request ID suffix', () => {
            expect(
                stripTechnicalErrorDetails('Some error\n\nID запроса: abc-123'),
            ).toBe('Some error');
        });

        it('returns original when no suffix', () => {
            expect(stripTechnicalErrorDetails('Some error')).toBe('Some error');
        });
    });

    describe('classifyBotError', () => {
        it('INSUFFICIENT_TOKENS', () => {
            expect(classifyBotError('INSUFFICIENT_TOKENS')).toBe(
                BotErrorCode.INSUFFICIENT_TOKENS,
            );
        });

        it.each([
            'Request timed out',
            'превысила максимальное время',
            'generation timed out',
        ])('TIMEOUT: %s', (msg) => {
            expect(classifyBotError(msg)).toBe(BotErrorCode.TIMEOUT);
        });

        it.each([
            'Не удалось отправить результат',
            'delivery failed',
        ])('DELIVERY: %s', (msg) => {
            expect(classifyBotError(msg)).toBe(BotErrorCode.DELIVERY);
        });

        it('POLL', () => {
            expect(classifyBotError('Не удалось проверить статус генерации')).toBe(
                BotErrorCode.POLL,
            );
        });

        it.each([
            'OPENAI_API_KEY not configured',
            'Model not configured for this tool',
            'API_KEY is missing',
        ])('CONFIG: %s', (msg) => {
            expect(classifyBotError(msg)).toBe(BotErrorCode.CONFIG);
        });

        it.each([
            'PROHIBITED_CONTENT detected',
            'SEXUALLY_EXPLICIT content',
            'blocked the request due to safety',
            'blocked by content policy',
            'safety filter triggered',
            'moderation flagged',
            'HATE_SPEECH',
            'HARASSMENT',
            'DANGEROUS_CONTENT',
            'IMAGE_SAFETY violation',
        ])('CONTENT_POLICY: %s', (msg) => {
            expect(classifyBotError(msg)).toBe(BotErrorCode.CONTENT_POLICY);
        });

        it.each([
            'Sharpii upstream error',
            'Topaz processing failed',
            'Midjourney queue full',
            'Higgsfield HTTP 500',
            'OpenRouter rate limit',
            'HeyGen generation failed',
            'BFL returned error',
            'Luma generation failed',
            'HTTP 500 internal',
            'provider returned error',
            'generation failed',
            'Insufficient credits',
            'Image generation failed',
        ])('PROVIDER: %s', (msg) => {
            expect(classifyBotError(msg)).toBe(BotErrorCode.PROVIDER);
        });

        it('UNKNOWN for unrecognized messages', () => {
            expect(classifyBotError('something weird happened')).toBe(
                BotErrorCode.UNKNOWN,
            );
        });

        it('strips technical details before classifying', () => {
            expect(
                classifyBotError('INSUFFICIENT_TOKENS\n\nID запроса: xyz'),
            ).toBe(BotErrorCode.INSUFFICIENT_TOKENS);
        });
    });

    describe('toUserFacingError', () => {
        it('returns insufficient tokens message', () => {
            expect(toUserFacingError('INSUFFICIENT_TOKENS', ru)).toBe(
                ru.aiResult.insufficientTokens,
            );
        });

        it('returns no subscription message', () => {
            expect(toUserFacingError('NO_SUBSCRIPTION', ru)).toBe(
                ru.aiResult.noSubscription,
            );
        });

        it('returns safety error for PROHIBITED_CONTENT', () => {
            expect(toUserFacingError('(PROHIBITED_CONTENT)', ru)).toBe(
                ru.aiResult.userErrors.prohibitedContent,
            );
        });

        it('returns safety error for SEXUALLY_EXPLICIT', () => {
            expect(toUserFacingError('(SEXUALLY_EXPLICIT)', ru)).toBe(
                ru.aiResult.userErrors.sexuallyExplicit,
            );
        });

        it('returns content policy error', () => {
            expect(toUserFacingError('blocked by content policy', ru)).toBe(
                ru.aiResult.userErrors.contentPolicy,
            );
        });

        it('returns generic safety for "blocked the request"', () => {
            expect(toUserFacingError('blocked the request', ru)).toBe(
                ru.aiResult.userErrors.safetyBlocked,
            );
        });

        it('returns rate limit error', () => {
            expect(toUserFacingError('rate limit exceeded', ru)).toBe(
                ru.aiResult.userErrors.rateLimit,
            );
        });

        it('returns generation failed error', () => {
            expect(toUserFacingError('generation failed', ru)).toBe(
                ru.aiResult.userErrors.generationFailed,
            );
        });

        it('does not leak provider names to user', () => {
            const result = toUserFacingError('Sharpii internal error', ru);
            expect(result).not.toContain('Sharpii');
        });

        it('does not leak Topaz', () => {
            const result = toUserFacingError('Topaz processing failed', ru);
            expect(result).not.toContain('Topaz');
        });

        it('does not leak OpenRouter', () => {
            const result = toUserFacingError('OpenRouter returned 500', ru);
            expect(result).not.toContain('OpenRouter');
        });

        it('does not leak BFL', () => {
            const result = toUserFacingError('BFL generation error', ru);
            expect(result).not.toContain('BFL');
        });

        it('does not leak Luma', () => {
            const result = toUserFacingError('Luma generation failed', ru);
            expect(result).not.toContain('Luma');
        });

        it('shows actionable Kling duration limit without brand name', () => {
            const result = toUserFacingError(
                'Kling: Video duration can not longer than 30.0s',
                ru,
            );
            expect(result).not.toContain('Kling');
            expect(result).toMatch(/30/);
            expect(result).toMatch(/длительность|видео/i);
            expect(result).not.toBe(ru.aiResult.errorByCode[BotErrorCode.PROVIDER]);
        });

        it('shows actionable duration detail for English locale', () => {
            const result = toUserFacingError(
                'Kling: Video duration can not longer than 30.0s',
                en,
            );
            expect(result).not.toContain('Kling');
            expect(result).toMatch(/30/);
            expect(result.toLowerCase()).toMatch(/duration|exceed/);
        });

        it('still hides opaque provider errors', () => {
            const result = toUserFacingError('Kling: upstream task aborted', ru);
            expect(result).not.toContain('Kling');
            expect(result).toBe(ru.aiResult.errorByCode[BotErrorCode.PROVIDER]);
        });

        it('passes through user-friendly Russian messages', () => {
            const msg = 'Генерация заняла слишком много времени, попробуйте ещё раз';
            expect(toUserFacingError(msg, ru)).toBe(msg);
        });

        it('returns generic error for unknown English messages', () => {
            expect(toUserFacingError('AxiosError', ru)).toBe(
                ru.aiResult.errorByCode[BotErrorCode.UNKNOWN],
            );
        });

        it('returns UNKNOWN code error for empty string', () => {
            expect(toUserFacingError('', ru)).toBe(
                ru.aiResult.errorByCode[BotErrorCode.UNKNOWN],
            );
        });
    });

    describe('formatUserBotError', () => {
        it('returns insufficientTokens directly for INSUFFICIENT_TOKENS', () => {
            const result = formatUserBotError(
                new Error('INSUFFICIENT_TOKENS'),
                ru,
            );
            expect(result).toBe(ru.aiResult.insufficientTokens);
        });

        it('wraps error with code for provider errors', () => {
            const result = formatUserBotError(
                new Error('Sharpii returned 500'),
                ru,
            );
            expect(result).toContain(`#${BotErrorCode.PROVIDER}`);
            expect(result).not.toContain('Sharpii');
        });

        it('handles string errors', () => {
            const result = formatUserBotError('some string error', ru);
            expect(result).toContain(`#${BotErrorCode.UNKNOWN}`);
        });

        it('handles non-error objects', () => {
            const result = formatUserBotError(42, ru);
            expect(result).toContain(`#${BotErrorCode.UNKNOWN}`);
        });
    });

    describe('formatUserBotErrorMessage', () => {
        it('delegates to formatUserBotError', () => {
            const result = formatUserBotErrorMessage('generation failed', ru);
            expect(result).toContain(`#${BotErrorCode.PROVIDER}`);
        });
    });
});
