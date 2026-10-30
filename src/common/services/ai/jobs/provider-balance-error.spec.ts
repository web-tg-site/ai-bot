import { isProviderBalanceError } from './provider-balance-error';

describe('isProviderBalanceError', () => {
    it.each([
        // Apiframe / Midjourney / Sharpii
        'Insufficient credits',
        'Insufficient credits (permanent: true)',
        'Insufficient corporate funds',
        'Pre-deduction failed: insufficient quota',
        'Insufficient credits\n\nID запроса: abc-123',
        '402 API error occurred: {"httpMeta":{"response":{},"request":{}}}',
        'Сбой на стороне провайдера (HTTP 402).',
        'Сбой на стороне провайдера (закончился баланс/квота). Попробуйте позже.',
        'Недостаточно квоты у провайдера для этой операции.',

        // OpenRouter
        'Payment required',
        'payment_required',
        'This request requires more credits, you can only afford 0',

        // OpenAI
        'You exceeded your current quota, please check your plan',
        '429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing',
        'insufficient_quota',
        'Billing hard limit has been reached',
        'billing_hard_limit_reached',
        'credit_balance_exhausted',
        'organization_spend_limit_exceeded',
        'project_spend_limit_exceeded',
        'organization_usage_limit_exceeded',

        // Google
        'Your Prepay credit balance is depleted.',
        'Your prepayment credits are depleted.',
        'Credits are depleted',

        // ElevenLabs
        'Your account does not have enough credits for this operation.',
        'insufficient_credits',

        // HeyGen
        'Your account has 5 credits but this video requires 10 credits. (insufficient_credit)',
        'usage_limit_reached',
        'quota_exceeded',

        // Higgsfield
        'not_enough_credits',

        // Topaz
        'Insufficient Balance',
        'Your wallet does not have enough balance.',
        'not enough balance',

        // BFL
        'Insufficient credits (HTTP 402)',
        'Insufficient credits: out of prepaid units',

        // Luma
        'Insufficient balance. Please add funds to continue.',
        'budget_exhausted',
        'Generation failed (budget_exhausted)',

        // Kling
        'Kling: Account balance not enough',
        'Account balance not enough to run this query, please recharge.',
        'Kling API [1102]: Account balance not enough',
        'Kling [1101]: error code 1101',
        'Kling API [1102]: error code 1102',
        'Resource pack exhausted',
        'Account is in arrears',

        // BytePlus / Ark
        'AccountBalanceNotEnough',
        'AccountOverdueError',
        'Pre-deduction failed: insufficient quota (HTTP 403)',
        'Operation denied (AccountBalanceNotEnough) (HTTP 403)',

        // Generic / machine
        'InsufficientBalanceError: Account balance not enough',
        'insufficient balance',
        'You are out of credits',
        'No remaining credits for this account',
        'InsufficientCreditsError',
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
        'RESOURCE_EXHAUSTED',
        'rate limit exceeded',
        'HTTP 429',
        'Kling: Video duration can not longer than 30.0s',
        'Flux перегружен. Подождите немного и попробуйте снова.',
        'Higgsfield отклонил ключи (HTTP 403). Проверьте HIGGSFIELD_API_KEY',
        '',
    ])('ignores %s', (message) => {
        expect(isProviderBalanceError(message)).toBe(false);
    });
});
