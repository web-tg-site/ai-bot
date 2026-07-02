import { UserWithTelegramId } from './user-with-telegram-id.type';

export type LongStandingActivityUser = 'two_days' | 'week' | 'month';

export const LONG_STANDING_ACTIVITY_DAYS: Record<
    LongStandingActivityUser,
    number
> = {
    two_days: 2,
    week: 7,
    month: 30,
};

export type LongStandingActivityDays =
    (typeof LONG_STANDING_ACTIVITY_DAYS)[LongStandingActivityUser];

export type LongStandingActivityUsers = Record<
    LongStandingActivityDays,
    UserWithTelegramId[]
>;
