import {
    AI_JOB_CAPACITY_RETRY_DELAY_MS,
    AI_JOB_CAPACITY_RETRY_MAX,
} from '@/common/config/ai-job.config';

const CAPACITY_ERROR_RE =
    /no available capacity|please retry shortly|queue full|no capacity available|capacity exceeded|overloaded|resource exhausted|RESOURCE_EXHAUSTED/i;

/**
 * Known flaky Veo 3.1 failures: audio RAI false positives and opaque
 * "no video" completions. Identical retries often succeed.
 * @see https://github.com/googleapis/js-genai/issues/1272
 */
const VEO_TRANSIENT_FILTER_RE =
    /issue with the audio for your prompt|could not create your video[\s\S]{0,120}(?:safety filters|other processing issues)|Veo generation failed|Veo завершил задачу без (?:видео|данных видео)/i;

export function isProviderCapacityError(message: string): boolean {
    const base = message.split('\n\nID запроса:')[0].trim();
    return CAPACITY_ERROR_RE.test(base);
}

/** Veo flaky filter / empty-result errors that are worth a silent resubmit. */
export function isVeoTransientFilterError(message: string): boolean {
    const base = message.split('\n\nID запроса:')[0].trim();
    // Hard content blocks must fail immediately — not worth burning retries.
    if (
        /Responsible AI practices|input image violates|real person|public figure|likeness/i.test(
            base,
        )
    ) {
        return false;
    }
    return VEO_TRANSIENT_FILTER_RE.test(base);
}

/**
 * Errors where the cron should silently resubmit the same job
 * (capacity / overload / known flaky Veo audio filter).
 */
export function isSilentProviderResubmitError(message: string): boolean {
    return (
        isProviderCapacityError(message) || isVeoTransientFilterError(message)
    );
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
