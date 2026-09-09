import {
    AI_JOB_CAPACITY_RETRY_DELAY_MS,
    AI_JOB_CAPACITY_RETRY_MAX,
} from '@/common/config/ai-job.config';

const CAPACITY_ERROR_RE =
    /no available capacity|please retry shortly|queue full|no capacity available|capacity exceeded|overloaded/i;

export function isProviderCapacityError(message: string): boolean {
    const base = message.split('\n\nID запроса:')[0].trim();
    return CAPACITY_ERROR_RE.test(base);
}

export function nextCapacityRetry(
    retryCount: number,
    now = Date.now(),
):
    | { action: 'retry'; retryCount: number; retryAt: Date }
    | { action: 'give_up' } {
    if (retryCount >= AI_JOB_CAPACITY_RETRY_MAX) {
        return { action: 'give_up' };
    }
    return {
        action: 'retry',
        retryCount: retryCount + 1,
        retryAt: new Date(now + AI_JOB_CAPACITY_RETRY_DELAY_MS),
    };
}
