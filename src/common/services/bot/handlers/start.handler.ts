import { UserModelService } from '@/common/models/user';
import { UserLanguage } from '@/generated/prisma/enums';
import { Telegraf } from 'telegraf';
import { getLanguagePickerKeyboard } from '../keyboards';
import { ru } from '../i18n/locales/ru';
import { registerLocalizedHears } from '../i18n/register-localized-hears';
import { showHome } from '../utils/show-home';

export const registerStartHandler = (
    bot: Telegraf,
    userModelService: UserModelService,
) => {
    bot.command('start', async (ctx) => {
        if (!ctx.from) return;

        const user = await userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );

        if (!user) {
            await ctx.reply(ru.languagePicker.prompt, {
                ...getLanguagePickerKeyboard(ru),
                parse_mode: 'HTML',
            });
            return;
        }

        await showHome(ctx, userModelService);
    });

    bot.action(/^lang:(RU|EN)$/, async (ctx) => {
        if (!ctx.from) return;

        const language = ctx.match[1] as UserLanguage;
        const existingUser = await userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );

        if (!existingUser) {
            await userModelService.createUser(
                ctx.from.id.toString(),
                ctx.from.username,
                language,
            );
        }

        await ctx.answerCbQuery();

        try {
            await ctx.deleteMessage();
        } catch {
            // message may already be deleted
        }

        await showHome(ctx, userModelService);
    });

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.back,
        async (ctx) => {
            await showHome(ctx, userModelService);
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.start,
        async (ctx) => {
            await showHome(ctx, userModelService);
        },
    );
};
