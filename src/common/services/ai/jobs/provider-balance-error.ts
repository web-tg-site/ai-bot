const PROVIDER_BALANCE_ERROR_RE =
    /Insufficient credits|Insufficient corporate funds|insufficient[_ ]quota|Pre-deduction failed|exceeded your current quota|Payment required|can only afford|Недостаточно квоты у провайдера|закончился баланс|баланс\/квота/i;

export function isProviderBalanceError(message: string): boolean {
    const base = message.split('\n\nID запроса:')[0].trim();
    if (!base || base === 'INSUFFICIENT_TOKENS') {
        return false;
    }
    return PROVIDER_BALANCE_ERROR_RE.test(base);
}
