import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';

export const SUB_PLAN_TO_COST: Record<
    SubscribePlan,
    Record<SubscribeType, { rub: number; usdt: number }>
> = {
    MONTHLY: {
        FREE: { rub: 0, usdt: 0 },
        NOT_SUBSCRIBED: { rub: 0, usdt: 0 },
        LITE: { rub: 2990, usdt: 37 },
        PRO: { rub: 5990, usdt: 75 },
        BUSINESS: { rub: 11990, usdt: 150 },
    },
    THREE_MONTHS: {
        FREE: { rub: 0, usdt: 0 },
        NOT_SUBSCRIBED: { rub: 0, usdt: 0 },
        LITE: { rub: 7990, usdt: 100 },
        PRO: { rub: 15990, usdt: 200 },
        BUSINESS: { rub: 31990, usdt: 400 },
    },
    SIX_MONTHS: {
        FREE: { rub: 0, usdt: 0 },
        NOT_SUBSCRIBED: { rub: 0, usdt: 0 },
        LITE: { rub: 13990, usdt: 175 },
        PRO: { rub: 27990, usdt: 350 },
        BUSINESS: { rub: 54990, usdt: 690 },
    },
    YEARLY: {
        FREE: { rub: 0, usdt: 0 },
        NOT_SUBSCRIBED: { rub: 0, usdt: 0 },
        LITE: { rub: 23990, usdt: 300 },
        PRO: { rub: 47990, usdt: 600 },
        BUSINESS: { rub: 94990, usdt: 1190 },
    },
};
