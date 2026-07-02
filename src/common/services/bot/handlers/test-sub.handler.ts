import { UserModelService } from '@/common/models/user';
import { Telegraf } from 'telegraf';
import { getFreeSubKeyboard, getSubActivateKeyboard } from '../keyboards';
import { getDateEndSub, getDateEndSubToDb } from '../utils';
import { SubscribeType } from '@/generated/prisma/enums';
import { getI18nForUser } from '../i18n';
import { registerLocalizedHears } from '../i18n/register-localized-hears';

export const registerTestSubHandler = (
    bot: Telegraf,
    userModelService: UserModelService,
) => {
    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.freeWeek,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.freeSub.text, {
                ...getFreeSubKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.activateTrial,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserByTelegramId(
                ctx.from.id.toString(),
                {
                    subscribeType: SubscribeType.FREE,
                    useFreeSub: true,
                    subscriptionEndsAt: getDateEndSubToDb(7),
                    isSubscriptionActive: true,
                    lastSubscriptionType: SubscribeType.FREE,
                    tokenLeft: 50,
                },
            );

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );

            await ctx.reply(i18n.freeSub.activateText(getDateEndSub(7)), {
                ...getSubActivateKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );
};
