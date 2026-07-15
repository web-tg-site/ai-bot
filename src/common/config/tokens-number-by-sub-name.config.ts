import { SubscribeType } from '@/generated/prisma/enums';

export const TOKENS_NUMBER_BY_SUB_NAME: Record<SubscribeType, number> = {
    FREE: 309,
    LITE: 3713,
    PRO: 7443,
    BUSINESS: 14901,
    NOT_SUBSCRIBED: 0,
};
