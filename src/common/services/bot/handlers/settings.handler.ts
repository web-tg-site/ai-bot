import { UserModelService } from '@/common/models/user';
import { UserLanguage } from '@/generated/prisma/enums';
import { BotSession } from '@/common/services/ai';
import { Context, Telegraf } from 'telegraf';
import { getI18n, getI18nForUser } from '../i18n';
import { registerLocalizedHears } from '../i18n/register-localized-hears';
import { getSettingsLanguageKeyboard } from '../keyboards/language.keyboard';
import { showHome } from '../utils/show-home';

type BotContext = Context & { session: BotSession };

export const registerSettingsHandler = (
    bot: Telegraf,
    userModelService: UserModelService,
) => {
    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.settings,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            if (!user) return;

            const i18n = getI18nForUser(user);
            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );

            await ctx.reply(i18n.settings.title, {
                ...getSettingsLanguageKeyboard(i18n, user.language),
                parse_mode: 'HTML',
            });
        },
    );

    bot.action(/^settings:lang:(RU|EN)$/, async (ctx) => {
        if (!ctx.from) return;

        const language = ctx.match[1] as UserLanguage;
        const user = await userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        if (user.language !== language) {
            await userModelService.updateUserLanguage(
                ctx.from.id.toString(),
                language,
            );

            const botCtx = ctx as unknown as BotContext;
            if (botCtx.session?.ai) {
                botCtx.session.ai = { step: 'idle' };
            }
        }

        const i18n = getI18n(language);
        await ctx.answerCbQuery(i18n.settings.languageChanged);

        try {
            await ctx.editMessageText(i18n.settings.title, {
                ...getSettingsLanguageKeyboard(i18n, language),
                parse_mode: 'HTML',
            });
        } catch {
            // message may be unchanged
        }

        await showHome(ctx, userModelService);
    });
};
