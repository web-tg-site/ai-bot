import { UserModelService } from '@/common/models/user';
import { AiToolCategory } from '@/common/services/ai/types';
import { BotSession } from '@/common/services/ai';
import { Context, Telegraf } from 'telegraf';
import { generateAiKeyboard } from '../keyboards';
import { getToolsByCategory } from '@/common/config/ai-tools.registry';
import { AiHandlerDeps } from './ai-tool.handler';
import { getMySubKeyboard } from '../keyboards/home.keyboard';
import { getI18nForUser, getToolLabel } from '../i18n';
import { registerLocalizedHears } from '../i18n/register-localized-hears';

type BotContext = Context & { session: BotSession };

function setActiveCategory(ctx: BotContext, category: AiToolCategory) {
    if (!ctx.session) {
        ctx.session = {};
    }
    if (!ctx.session.ai) {
        ctx.session.ai = { step: 'idle' };
    }
    ctx.session.ai.activeCategory = category;
}

export const registerAiHandler = (
    bot: Telegraf,
    deps: AiHandlerDeps & { userModelService: UserModelService },
) => {
    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.textCategory,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await deps.userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            setActiveCategory(ctx as BotContext, 'text');
            await deps.userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            const tools = getToolsByCategory('text').map((t) =>
                getToolLabel(t.id, user?.language),
            );
            await ctx.reply(i18n.ai.textBots, {
                ...generateAiKeyboard(i18n, tools),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.imageCategory,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await deps.userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            setActiveCategory(ctx as BotContext, 'image');
            await deps.userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            const tools = getToolsByCategory('image').map((t) =>
                getToolLabel(t.id, user?.language),
            );
            await ctx.reply(i18n.ai.imageBots, {
                ...generateAiKeyboard(i18n, tools),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.videoCategory,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await deps.userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            setActiveCategory(ctx as BotContext, 'video');
            await deps.userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            const tools = getToolsByCategory('video').map((t) =>
                getToolLabel(t.id, user?.language),
            );
            await ctx.reply(i18n.ai.videoBots, {
                ...generateAiKeyboard(i18n, tools),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.audioCategory,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await deps.userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            setActiveCategory(ctx as BotContext, 'audio');
            await deps.userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            const tools = getToolsByCategory('audio').map((t) =>
                getToolLabel(t.id, user?.language),
            );
            await ctx.reply(i18n.ai.audioBots, {
                ...generateAiKeyboard(i18n, tools),
                parse_mode: 'HTML',
            });
        },
    );

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.mySub,
        async (ctx) => {
            if (!ctx.from) return;

            const user = await deps.userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            if (!user) return;

            const i18n = getI18nForUser(user);

            await ctx.reply(
                i18n.aiResult.mySubscription(
                    i18n.records.subTypeToText[user.subscribeType] ??
                        user.subscribeType,
                    user.tokenLeft,
                    user.subscriptionEndsAt,
                ),
                {
                    ...getMySubKeyboard(i18n),
                    parse_mode: 'HTML',
                },
            );
        },
    );
};
