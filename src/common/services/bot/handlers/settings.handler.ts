import { UserModelService } from '@/common/models/user';
import { UserLanguage } from '@/generated/prisma/enums';
import { BotSession } from '@/common/services/ai';
import { Context, Telegraf } from 'telegraf';
import { getI18n, getI18nForUser } from '../i18n';
import { registerLocalizedHears } from '../i18n/register-localized-hears';
import { getSettingsKeyboard } from '../keyboards/language.keyboard';
import { showHome } from '../utils/show-home';
import { resetAiSessionPreservingGpt } from '../utils/gpt-session';

type BotContext = Context & { session: BotSession };

async function replySettings(
    ctx: Context,
    userModelService: UserModelService,
    telegramId: string,
) {
    const user = await userModelService.getUserByTelegramId(telegramId);
    if (!user) return;

    const i18n = getI18nForUser(user);
    const text = i18n.settings.title;
    const keyboard = getSettingsKeyboard(
        i18n,
        user.language,
        user.autoModelFailover !== false,
    );

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                ...keyboard,
                parse_mode: 'HTML',
            });
            return;
        } catch {
            // fall through to reply
        }
    }

    await ctx.reply(text, {
        ...keyboard,
        parse_mode: 'HTML',
    });
}

export const registerSettingsHandler = (
    bot: Telegraf,
    userModelService: UserModelService,
) => {
    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.settings,
        async (ctx) => {
            if (!ctx.from) return;

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await replySettings(ctx, userModelService, ctx.from.id.toString());
        },
    );

    bot.action('settings:open', async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCbQuery();
        await replySettings(ctx, userModelService, ctx.from.id.toString());
    });

    bot.action('settings:failover:toggle', async (ctx) => {
        if (!ctx.from) return;

        const user = await userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const next = user.autoModelFailover === false;
        await userModelService.updateAutoModelFailover(
            ctx.from.id.toString(),
            next,
        );

        const i18n = getI18n(user.language);
        await ctx.answerCbQuery(i18n.settings.autoFailoverToggled(next));
        await replySettings(ctx, userModelService, ctx.from.id.toString());
    });

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
                resetAiSessionPreservingGpt(botCtx.session);
            }
        }

        const refreshed = await userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        const i18n = getI18n(language);
        await ctx.answerCbQuery(i18n.settings.languageChanged);

        try {
            await ctx.editMessageText(i18n.settings.title, {
                ...getSettingsKeyboard(
                    i18n,
                    language,
                    refreshed?.autoModelFailover !== false,
                ),
                parse_mode: 'HTML',
            });
        } catch {
            // message may be unchanged
        }

        await showHome(ctx, userModelService);
    });
};
