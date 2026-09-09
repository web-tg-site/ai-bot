import {
    AI_JOB_CAPACITY_RETRY_DELAY_MS,
    AI_JOB_CAPACITY_RETRY_MAX,
} from '@/common/config/ai-job.config';
import {
    isProviderCapacityError,
    nextCapacityRetry,
} from './provider-capacity-retry';

describe('isProviderCapacityError', () => {
    it.each([
        'No available capacity — please retry shortly',
        'Midjourney queue full',
        'provider overloaded',
        'No available capacity — please retry shortly\n\nID запроса: abc',
    ])('detects %s', (message) => {
        expect(isProviderCapacityError(message)).toBe(true);
    });

    it.each(['Generation failed', 'INSUFFICIENT_TOKENS', 'prompt is required'])(
        'ignores %s',
        (message) => {
            expect(isProviderCapacityError(message)).toBe(false);
        },
    );
});

describe('nextCapacityRetry', () => {
    const now = 1_700_000_000_000;

    it('schedules up to 3 retries a minute apart', () => {
        const first = nextCapacityRetry(0, now);
        expect(first).toEqual({
            action: 'retry',
            retryCount: 1,
            retryAt: new Date(now + AI_JOB_CAPACITY_RETRY_DELAY_MS),
        });

        const last = nextCapacityRetry(AI_JOB_CAPACITY_RETRY_MAX - 1, now);
        expect(last).toMatchObject({
            action: 'retry',
            retryCount: AI_JOB_CAPACITY_RETRY_MAX,
        });
    });

    it('gives up after 3 retries', () => {
        expect(nextCapacityRetry(AI_JOB_CAPACITY_RETRY_MAX, now)).toEqual({
            action: 'give_up',
        });
    });
});
