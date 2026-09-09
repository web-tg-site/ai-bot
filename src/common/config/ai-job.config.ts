/** Max age before a pending/processing job is auto-failed (6 hours). */
export const AI_JOB_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Max consecutive poll HTTP/provider errors before failing the job. */
export const AI_JOB_MAX_POLL_ERRORS = 10;

/** Wall-clock budget for one cron tick — avoids blocking subsequent ticks. */
export const AI_JOB_CRON_TICK_BUDGET_MS = 10_000;

/** Pending jobs fetched per cron tick. */
export const AI_JOB_POLL_BATCH_SIZE = 50;

/** Stale-job reminder threshold (3 minutes). */
export const AI_JOB_STALE_REMINDER_MS = 3 * 60 * 1000;

/** Silent resubmits when the provider is at capacity (user still sees waiting). */
export const AI_JOB_CAPACITY_RETRY_MAX = 3;

export const AI_JOB_CAPACITY_RETRY_DELAY_MS = 60_000;
