import { UserModelService } from '@/common/models/user';
import { BotSession } from '@/common/services/ai';
import { Context, Telegraf } from 'telegraf';
import { getSupportInnerKeyboard, getSupportKeyboard } from '../keyboards';
import { getI18nForUser } from '../i18n';
import { registerLocalizedHears } from '../i18n/register-localized-hears';
import {
    formatTechSupportMessage,
    MIN_TECH_SUPPORT_TEXT_LENGTH,
    TECH_SUPPORT_CHAT_ID,
} from '../utils/format-tech-support';
import { showHome } from '../utils/show-home';

type BotContext = Context & { session: BotSession };

function getSession(ctx: Context): BotSession {
    const botCtx = ctx as BotContext;
    if (!botCtx.session) {
        botCtx.session = {};
    }
    return botCtx.session;
}

function clearPendingTechSupport(ctx: Context): void {
    const session = getSession(ctx);
    session.pendingTechSupport = undefined;
}

export const registerSupportHandler = (
    bot: Telegraf,
    userModelService: UserModelService,
) => {
    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.support,
        async (ctx) => {
            if (!ctx.from) return;

            clearPendingTechSupport(ctx);

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

            const session = getSession(ctx);
            session.pendingTechSupport = true;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.support.telegram, {
                ...getSupportInnerKeyboard(i18n),
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.email,
        async (ctx) => {
            if (!ctx.from) return;

            clearPendingTechSupport(ctx);

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

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.privacyPolicy,
        async (ctx) => {
            if (!ctx.from) return;

            clearPendingTechSupport(ctx);

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.support.privacyPolicy, {
                ...getSupportInnerKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.userAgreement,
        async (ctx) => {
            if (!ctx.from) return;

            clearPendingTechSupport(ctx);

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.support.userAgreement, {
                ...getSupportInnerKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.refundPolicy,
        async (ctx) => {
            if (!ctx.from) return;

            clearPendingTechSupport(ctx);

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.support.refundPolicy, {
                ...getSupportInnerKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );

    bot.on('message', async (ctx, next) => {
        if (!ctx.from) return next();

        const session = getSession(ctx);
        if (!session.pendingTechSupport) {
            return next();
        }

        const text =
            'text' in ctx.message && typeof ctx.message.text === 'string'
                ? ctx.message.text
                : undefined;

        if (text?.startsWith('/')) {
            return next();
        }

        const user = await userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        const i18n = getI18nForUser(user);

        await userModelService.updateUserLastActivityAt(ctx.from.id.toString());

        if (!text) {
            await ctx.reply(i18n.support.telegramNotText, {
                ...getSupportInnerKeyboard(i18n),
            });
            return;
        }

        if (text.length < MIN_TECH_SUPPORT_TEXT_LENGTH) {
            await ctx.reply(i18n.support.telegramTooShort, {
                ...getSupportInnerKeyboard(i18n),
            });
            return;
        }

        try {
            await ctx.telegram.sendMessage(
                TECH_SUPPORT_CHAT_ID,
                formatTechSupportMessage(ctx.from, text),
                { link_preview_options: { is_disabled: true } },
            );
        } catch {
            await ctx.reply(i18n.support.telegramSendFailed, {
                ...getSupportInnerKeyboard(i18n),
            });
            return;
        }

        session.pendingTechSupport = undefined;
        await ctx.reply(i18n.support.telegramSuccess);
        await showHome(ctx, userModelService);
    });
};
