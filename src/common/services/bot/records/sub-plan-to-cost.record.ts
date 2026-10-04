import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';

type SubCost = { rub: number; usdt: number; stars: number };

const cost = (rub: number, usdt: number): SubCost => ({
    rub,
    usdt,
    stars: rub,
});

const free: SubCost = { rub: 0, usdt: 0, stars: 0 };

export const SUB_PLAN_TO_COST: Record<
    SubscribePlan,
    Record<SubscribeType, SubCost>
> = {
    MONTHLY: {
        FREE: free,
        NOT_SUBSCRIBED: free,
        LITE: cost(2990, 37),
        PRO: cost(5990, 75),
        BUSINESS: cost(11990, 150),
    },
    THREE_MONTHS: {
        FREE: free,
        NOT_SUBSCRIBED: free,
        LITE: cost(7990, 100),
        PRO: cost(15990, 200),
        BUSINESS: cost(31990, 400),
    },
    SIX_MONTHS: {
        FREE: free,
        NOT_SUBSCRIBED: free,
        LITE: cost(13990, 175),
        PRO: cost(27990, 350),
        BUSINESS: cost(54990, 690),
    },
    YEARLY: {
        FREE: free,
        NOT_SUBSCRIBED: free,
        LITE: cost(23990, 300),
        PRO: cost(47990, 600),
        BUSINESS: cost(94990, 1190),
    },
};
