import { UserModelService } from '@/common/models/user';
import { Telegraf } from 'telegraf';
import { getSupportInnerKeyboard, getSupportKeyboard } from '../keyboards';
import { getI18nForUser } from '../i18n';
import { registerLocalizedHears } from '../i18n/register-localized-hears';

export const registerSupportHandler = (
    bot: Telegraf,
    userModelService: UserModelService,
) => {
    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.support,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.support.text, {
                ...getSupportKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.telegram,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.support.telegram, {
                ...getSupportInnerKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.email,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.support.email, {
                ...getSupportInnerKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );
};
