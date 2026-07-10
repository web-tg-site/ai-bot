import { SubscribePlan } from '@/generated/prisma/enums';

export const SUB_PLAN_TO_MONTHS: Record<SubscribePlan, number> = {
    MONTHLY: 1,
    THREE_MONTHS: 3,
    SIX_MONTHS: 6,
    YEARLY: 12,
};

export function getSubscriptionDurationDays(plan: SubscribePlan): number {
    return SUB_PLAN_TO_MONTHS[plan] * 30;
}
