import { SubscribeType } from '@/generated/prisma/enums';

export type ActivatedNextSubscriptionUser = {
    telegramId: string;
    subscribeType: SubscribeType;
    subscriptionEndsAt: Date;
};

export type DeactivatedSubscriptionUser = {
    telegramId: string;
    subscribeType: SubscribeType;
};

export type ProcessSubscriptionsEndingTodayResult = {
    activatedNextSubUsers: ActivatedNextSubscriptionUser[];
    deactivatedUsers: DeactivatedSubscriptionUser[];
};
