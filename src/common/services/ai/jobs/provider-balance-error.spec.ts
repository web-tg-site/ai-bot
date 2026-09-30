import { isProviderBalanceError } from './provider-balance-error';

describe('isProviderBalanceError', () => {
    it.each([
        'Insufficient credits',
        'Insufficient credits (permanent: true)',
        'Insufficient corporate funds',
        'Pre-deduction failed: insufficient quota',
        'You exceeded your current quota, please check your plan',
        'insufficient_quota',
        'Payment required',
        'This request requires more credits, you can only afford 0',
        'Недостаточно квоты у провайдера для этой операции.',
        'Сбой на стороне провайдера (закончился баланс/квота). Попробуйте позже.',
        'Insufficient credits\n\nID запроса: abc-123',
        '402 API error occurred: {"httpMeta":{"response":{},"request":{}}}',
        'Сбой на стороне провайдера (HTTP 402).',
    ])('detects %s', (message) => {
        expect(isProviderBalanceError(message)).toBe(true);
    });

    it.each([
        'INSUFFICIENT_TOKENS',
        'INSUFFICIENT_TOKENS\n\nID запроса: xyz',
        'Generation failed',
        'prompt is required',
        'Сбой на стороне провайдера. Попробуйте позже или выберите другой инструмент.',
        'No available capacity — please retry shortly',
        '',
    ])('ignores %s', (message) => {
        expect(isProviderBalanceError(message)).toBe(false);
    });
});
