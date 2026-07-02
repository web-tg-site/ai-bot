import { SubscribePlan } from '@/generated/prisma/enums';
import { PAID_SUBSCRIPTION_TYPES } from '../types';

export const WHERE_FOR_GET_USER_WITH_NEED_TO_GET_SUBS_AND_UPDATE_CONFIG = (
    oneMonthFromNowBounds: { start: Date; end: Date },
    oneMonthAgoBounds: { start: Date; end: Date },
) => {
    return {
        subscribePlan: {
            not: SubscribePlan.MONTHLY,
        },
        subscribeType: {
            in: [...PAID_SUBSCRIPTION_TYPES],
        },
        isSubscriptionActive: true,
        subscriptionEndsAt: {
            gte: oneMonthFromNowBounds.start,
        },
        OR: [
            {
                lastTokenIssueAt: {
                    gte: oneMonthAgoBounds.start,
                    lte: oneMonthAgoBounds.end,
                },
            },
            {
                lastTokenIssueAt: null,
                subscriptionStartsAt: {
                    gte: oneMonthAgoBounds.start,
                    lte: oneMonthAgoBounds.end,
                },
            },
        ],
    };
};
