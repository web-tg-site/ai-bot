import { SubscribeType } from '@/generated/prisma/enums';

export type RunningOutSubscriptionDays = 3 | 1;

export type RunningOutSubscriptionUser = {
    telegramId: string;
    subscriptionEndsAt: Date;
};

export const PAID_SUBSCRIPTION_TYPES = [
    SubscribeType.LITE,
    SubscribeType.PRO,
    SubscribeType.BUSINESS,
] as const;

export type RunningOutSubscriptionUsers = Record<
    RunningOutSubscriptionDays,
    RunningOutSubscriptionUser[]
>;
