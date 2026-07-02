import { SubscribePlan } from '@/generated/prisma/enums';
import { ru } from '../i18n/locales/ru';

export const SUB_PLAN_TO_PERIOD: Record<SubscribePlan, string> =
    ru.records.subPlanToPeriod;

export const SUB_TYPE_TO_NUMBER_OF_MONTH: Record<SubscribePlan, number> = {
    MONTHLY: 1,
    THREE_MONTHS: 3,
    SIX_MONTHS: 6,
    YEARLY: 12,
};
