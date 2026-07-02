import { ru } from '../i18n/locales/ru';
import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';

export const CHOOSE_SUB_TEXT = ru.subs.chooseSub;
export const getSubTextForPeriod = (plan: SubscribePlan) =>
    ru.subs.subTextForPeriod(plan);
export const getSubTextForSubType = (
    type: SubscribeType,
    plan: SubscribePlan,
) => ru.subs.subTextForSubType(type, plan);
