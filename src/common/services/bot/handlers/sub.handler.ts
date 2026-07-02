import { UserModelService } from '@/common/models/user';
import { Telegraf } from 'telegraf';
import {
    getChooseSubKeyboard,
    getSubsPlansKeyboard,
    getSubsTypesKeyboard,
} from '../keyboards/subs.keyboard';
import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';
import { SUB_PLAN_TO_COST } from '../records';
import { formatRub } from '../utils';
import { getI18nForUser } from '../i18n';
import { registerLocalizedHears } from '../i18n/register-localized-hears';

export const registerSubHandler = (
    bot: Telegraf,
    userModelService: UserModelService,
) => {
    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.subsTariffs,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.subs.chooseSub, {
                ...getChooseSubKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );

    for (const plan of Object.keys(SubscribePlan) as SubscribePlan[]) {
        registerLocalizedHears(
            bot,
            (i18n) => i18n.records.subPlanToPeriod[plan],
            async (ctx) => {
                if (!ctx.from) return;

                const user = await userModelService.getUserByTelegramId(
                    ctx.from.id.toString(),
                );
                const i18n = getI18nForUser(user);

                await userModelService.updateUserLastActivityAt(
                    ctx.from.id.toString(),
                );
                await ctx.reply(i18n.subs.subTextForPeriod(plan), {
                    ...getSubsPlansKeyboard(i18n, plan),
                    parse_mode: 'HTML',
                });
            },
        );
    }

    for (const plan of Object.keys(SubscribePlan) as SubscribePlan[]) {
        for (const type of Object.keys(SubscribeType) as SubscribeType[]) {
            if (
                type === SubscribeType.FREE ||
                type === SubscribeType.NOT_SUBSCRIBED
            )
                continue;

            const label = `${type} ${formatRub(SUB_PLAN_TO_COST[plan][type].rub)} ₽ | ${SUB_PLAN_TO_COST[plan][type].usdt} USDT`;

            bot.hears(label, async (ctx) => {
                if (!ctx.from) return;

                const user = await userModelService.getUserByTelegramId(
                    ctx.from.id.toString(),
                );
                const i18n = getI18nForUser(user);

                await userModelService.updateUserLastActivityAt(
                    ctx.from.id.toString(),
                );
                await ctx.reply(i18n.subs.subTextForSubType(type, plan), {
                    ...getSubsTypesKeyboard(i18n, plan, type),
                    parse_mode: 'HTML',
                });
            });
        }
    }
};
