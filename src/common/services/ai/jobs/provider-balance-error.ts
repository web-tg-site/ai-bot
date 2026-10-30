/**
 * Detects provider-side billing / credits / prepaid-quota exhaustion.
 * Used for admin alerts (CHAT_MODEL_DENAY) and to hide raw billing text from users.
 *
 * Coverage (by provider error shapes we actually throw or pass through):
 * - Apiframe / Midjourney: Insufficient credits, HTTP 402
 * - Sharpii: Insufficient corporate funds / credits, Pre-deduction failed → RU remap
 * - OpenRouter: 402, can only afford, payment_required
 * - OpenAI: insufficient_quota, billing_hard_limit_reached, spend/usage limits,
 *   credit_balance_exhausted, "You have no credits remaining" (HTTP 429 billing)
 * - Google: Prepay / prepayment credits depleted, payment_required, HTTP 402
 * - ElevenLabs: insufficient_credits, "does not have enough credits", RU 402 remap
 * - HeyGen: insufficient_credit, usage_limit_reached
 * - Higgsfield: not_enough_credits (often HTTP 403)
 * - Topaz: Insufficient Balance, wallet not enough, HTTP 402
 * - BFL: HTTP 402 / insufficient credits
 * - Luma: Insufficient balance, budget_exhausted
 * - Kling: Account balance not enough, codes 1101 / 1102
 * - BytePlus / Ark: Pre-deduction failed, AccountBalanceNotEnough, AccountOverdue
 *
 * Intentionally NOT matched: bare RESOURCE_EXHAUSTED / capacity / rate-limit 429,
 * user wallet INSUFFICIENT_TOKENS.
 */
const PROVIDER_BALANCE_ERROR_RE = new RegExp(
    [
        // HTTP / transport
        String.raw`\b402\b`,
        String.raw`HTTP\s*402`,
        String.raw`payment[_\s-]?required`,

        // Generic English billing / credits
        String.raw`Insufficient(?:Balance(?:Error)?|(?:\s+)?(?:credits?|corporate funds|balance|funds|quota))`,
        String.raw`insufficient[_\s-]?(?:quota|balance|funds|credits?)`,
        String.raw`not[_\s-]?enough[_\s-]?(?:credits?|balance|funds|quota)`,
        String.raw`Account balance not enough`,
        String.raw`balance not enough`,
        String.raw`(?:does not|don't|do not) have enough credits`,
        String.raw`wallet (?:does )?not have enough`,
        String.raw`not (?:have )?enough balance`,
        String.raw`out of credits`,
        String.raw`no remaining credits`,
        String.raw`no credits remaining`,
        String.raw`can only afford`,
        String.raw`Pre-deduction failed`,
        String.raw`exceeded your current quota`,
        String.raw`quota_exceeded`,
        String.raw`usage[_\s-]?limit[_\s-]?(?:reached|exceeded)`,
        String.raw`credit[_\s-]?balance[_\s-]?(?:exhausted|depleted)`,
        String.raw`credits? (?:are |is )?(?:depleted|exhausted)`,
        String.raw`(?:Prepay|prepayment) credits?(?: balance)? (?:is |are )?depleted`,
        String.raw`Billing hard limit`,
        String.raw`billing_hard_limit_reached`,
        String.raw`(?:organization|project)_(?:spend|usage)_limit_exceeded`,
        String.raw`spend limit (?:has been )?exceeded`,
        String.raw`budget[_\s-]?exhausted`,
        String.raw`please (?:recharge|add funds)`,

        // CamelCase / machine codes (BytePlus, HeyGen, Higgsfield, OpenAI, …)
        String.raw`AccountBalanceNotEnough`,
        String.raw`AccountOverdue(?:Error)?`,
        String.raw`InsufficientCredits(?:Error)?`,
        String.raw`InsufficientBalance(?:Error)?`,

        // Kling prepaid/postpaid API codes (docs: 1101 arrears, 1102 pack empty)
        String.raw`\b110[12]\b`,
        String.raw`resource pack (?:exhausted|expired|not enough)`,
        String.raw`in arrears`,

        // Russian remaps used by our providers
        String.raw`Недостаточно квоты у провайдера`,
        String.raw`закончился баланс`,
        String.raw`баланс\/квота`,
    ].join('|'),
    'i',
);

export function isProviderBalanceError(message: string): boolean {
    const base = message.split('\n\nID запроса:')[0].trim();
    if (!base || base === 'INSUFFICIENT_TOKENS') {
        return false;
    }
    return PROVIDER_BALANCE_ERROR_RE.test(base);
}
