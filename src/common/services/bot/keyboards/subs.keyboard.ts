import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';
import { SUB_PLAN_TO_COST } from '../records';
import { Markup } from 'telegraf';
import { formatRub } from '../utils';
import { I18nBundle } from '../i18n';

export const getChooseSubKeyboard = (i18n: I18nBundle) => {
    const periods = Object.values(SubscribePlan).map(
        (plan) => i18n.records.subPlanToPeriod[plan],
    );

    return Markup.keyboard([periods, [i18n.buttons.back]]).resize();
};

export const getSubsPlansKeyboard = (i18n: I18nBundle, plan: SubscribePlan) => {
    const keyboard: string[][] = [];
    const cost = SUB_PLAN_TO_COST[plan];

    for (const type of Object.keys(cost) as SubscribeType[]) {
        if (
            type === SubscribeType.FREE ||
            type === SubscribeType.NOT_SUBSCRIBED
        )
            continue;

        keyboard.push([
            `${type} ${formatRub(cost[type].rub)} ₽ | ${cost[type].usdt} USDT`,
        ]);
    }

    keyboard.push([i18n.buttons.back]);

    return Markup.keyboard(keyboard).resize();
};

export const getSubsTypesKeyboard = (
    i18n: I18nBundle,
    plan: SubscribePlan,
    type: SubscribeType,
) =>
    Markup.keyboard([
        [i18n.buttons.sbp(formatRub(SUB_PLAN_TO_COST[plan][type].rub))],
        [i18n.buttons.usdt(SUB_PLAN_TO_COST[plan][type].usdt)],
        [i18n.buttons.back],
    ]).resize();
