import { AiToolId, BotSession } from '@/common/services/ai';
import { Context, Telegraf } from 'telegraf';
import { BotHandlerDeps } from '../types/bot-handler-deps.type';
import { getI18nForUser } from '../i18n';
import {
    generateGptChatListKeyboard,
    generateGptClearConfirmKeyboard,
    generateGptControlKeyboard,
    GPT_CHAT_LIST_PAGE_SIZE,
} from '../keyboards/gpt.keyboard';
import {
    getGptSessionDefaults,
    getNextGptReplyMode,
} from '../utils/gpt-session';
import {
    escapeTelegramHtml,
    markdownToTelegramHtml,
} from '@/common/utils/markdown-to-telegram-html';
import { isChatAssistantTool } from '@/common/utils/is-chat-assistant-tool';

type BotContext = Context & { session: BotSession };

function resolveChatAssistantToolId(session: BotSession): AiToolId {
    return isChatAssistantTool(session.ai?.activeToolId)
        ? session.ai.activeToolId
        : AiToolId.GPT;
}

function asBotContext(ctx: Context): BotContext {
    return ctx as BotContext;
}

function getSession(ctx: Context): BotSession {
    const botCtx = asBotContext(ctx);
    if (!botCtx.session) {
        botCtx.session = {};
    }
    return botCtx.session;
}

function ensureGptSession(session: BotSession) {
    const defaults = getGptSessionDefaults(session.ai);
    if (!session.ai) {
        session.ai = { step: 'idle', ...defaults };
    } else {
        session.ai.gptWebSearch = defaults.gptWebSearch;
        session.ai.gptReplyMode = defaults.gptReplyMode;
    }
}

export const registerGptChatHandlers = (
    bot: Telegraf,
    deps: BotHandlerDeps,
) => {
    bot.action('gpt:new', async (ctx) => {
        if (!ctx.from) return;

        const user = await deps.userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const i18n = getI18nForUser(user);
        const session = getSession(ctx);
        ensureGptSession(session);
        const toolId = resolveChatAssistantToolId(session);

        const conversation =
            await deps.gptConversationModelService.createConversation(
                user.id,
                toolId,
            );
        await deps.gptConversationModelService.trimOldConversations(
            user.id,
            toolId,
        );

        session.ai = {
            ...session.ai!,
            activeToolId: toolId,
            step: 'awaiting_input',
            activeConversationId: conversation.id,
        };

        await ctx.answerCbQuery(i18n.gptChat.newChatCreated);
        await ctx.reply(i18n.gptChat.newChatCreated, {
            ...generateGptControlKeyboard(i18n, {
                webSearch: session.ai.gptWebSearch !== false,
                replyMode: session.ai.gptReplyMode ?? 'text',
            }),
            parse_mode: 'HTML',
        });
    });

    bot.action(/^gpt:list:(\d+)$/, async (ctx) => {
        if (!ctx.from) return;

        const user = await deps.userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const i18n = getI18nForUser(user);
        const session = getSession(ctx);
        const toolId = resolveChatAssistantToolId(session);
        const page = Number(ctx.match[1]);
        const { items, total } =
            await deps.gptConversationModelService.listConversations(
                user.id,
                toolId,
                GPT_CHAT_LIST_PAGE_SIZE,
                page * GPT_CHAT_LIST_PAGE_SIZE,
            );

        if (!items.length) {
            await ctx.answerCbQuery(i18n.gptChat.noChats);
            return;
        }

        await ctx.answerCbQuery();
        await ctx.reply(i18n.gptChat.chatListTitle, {
            ...generateGptChatListKeyboard(i18n, items, page, total),
            parse_mode: 'HTML',
        });
    });

    bot.action(/^gpt:open:(.+)$/, async (ctx) => {
        if (!ctx.from) return;

        const user = await deps.userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const conversationId = ctx.match[1];
        const session = getSession(ctx);
        ensureGptSession(session);
        const toolId = resolveChatAssistantToolId(session);
        const conversation =
            await deps.gptConversationModelService.getConversation(
                user.id,
                conversationId,
                toolId,
            );

        const i18n = getI18nForUser(user);
        if (!conversation) {
            await ctx.answerCbQuery(i18n.gptChat.chatNotFound);
            return;
        }

        session.ai = {
            ...session.ai!,
            activeToolId: toolId,
            step: 'awaiting_input',
            activeConversationId: conversation.id,
        };

        const lastMessage =
            await deps.gptConversationModelService.getLastMessage(
                conversation.id,
            );

        const previewContent = lastMessage?.content
            ? markdownToTelegramHtml(
                  lastMessage.content.slice(0, 200) +
                      (lastMessage.content.length > 200 ? '…' : ''),
              )
            : undefined;

        await ctx.answerCbQuery();
        await ctx.reply(
            i18n.gptChat.chatOpened(
                escapeTelegramHtml(conversation.title),
                previewContent,
            ),
            {
                ...generateGptControlKeyboard(i18n, {
                    webSearch: session.ai.gptWebSearch !== false,
                    replyMode: session.ai.gptReplyMode ?? 'text',
                }),
                parse_mode: 'HTML',
            },
        );
    });

    bot.action('gpt:clear', async (ctx) => {
        if (!ctx.from) return;

        const user = await deps.userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const i18n = getI18nForUser(user);
        const session = getSession(ctx);

        if (!session.ai?.activeConversationId) {
            await ctx.answerCbQuery(i18n.gptChat.noActiveChat);
            return;
        }

        await ctx.answerCbQuery();
        await ctx.reply(i18n.gptChat.clearConfirm, {
            ...generateGptClearConfirmKeyboard(i18n),
            parse_mode: 'HTML',
        });
    });

    bot.action('gpt:clear:confirm', async (ctx) => {
        if (!ctx.from) return;

        const user = await deps.userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const i18n = getI18nForUser(user);
        const session = getSession(ctx);
        const conversationId = session.ai?.activeConversationId;

        if (!conversationId) {
            await ctx.answerCbQuery(i18n.gptChat.noActiveChat);
            return;
        }

        await deps.gptConversationModelService.clearConversation(
            conversationId,
        );

        await ctx.answerCbQuery(i18n.gptChat.historyCleared);
        try {
            await ctx.editMessageText(i18n.gptChat.historyCleared, {
                parse_mode: 'HTML',
            });
        } catch {
            await ctx.reply(i18n.gptChat.historyCleared, {
                parse_mode: 'HTML',
            });
        }
    });

    bot.action('gpt:clear:cancel', async (ctx) => {
        const user = ctx.from
            ? await deps.userModelService.getUserByTelegramId(
                  ctx.from.id.toString(),
              )
            : null;
        const i18n = getI18nForUser(user);
        await ctx.answerCbQuery();
        try {
            await ctx.deleteMessage();
        } catch {
            await ctx.reply(i18n.gptChat.clearCancelled);
        }
    });

    bot.action(/^gpt:web_search:(on|off)$/, async (ctx) => {
        if (!ctx.from) return;

        const user = await deps.userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const i18n = getI18nForUser(user);
        const session = getSession(ctx);
        ensureGptSession(session);

        session.ai!.gptWebSearch = ctx.match[1] === 'on';

        await ctx.answerCbQuery(
            session.ai!.gptWebSearch
                ? i18n.gptChat.webSearchEnabled
                : i18n.gptChat.webSearchDisabled,
        );

        try {
            await ctx.editMessageReplyMarkup(
                generateGptControlKeyboard(i18n, {
                    webSearch: session.ai!.gptWebSearch !== false,
                    replyMode: session.ai!.gptReplyMode ?? 'text',
                }).reply_markup,
            );
        } catch {
            // message may not have inline keyboard
        }
    });

    bot.action('gpt:reply_mode', async (ctx) => {
        if (!ctx.from) return;

        const user = await deps.userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const i18n = getI18nForUser(user);
        const session = getSession(ctx);
        ensureGptSession(session);

        session.ai!.gptReplyMode = getNextGptReplyMode(
            session.ai!.gptReplyMode,
        );

        await ctx.answerCbQuery(
            i18n.gptChat.replyModeChanged(session.ai!.gptReplyMode),
        );

        try {
            await ctx.editMessageReplyMarkup(
                generateGptControlKeyboard(i18n, {
                    webSearch: session.ai!.gptWebSearch !== false,
                    replyMode: session.ai!.gptReplyMode ?? 'text',
                }).reply_markup,
            );
        } catch {
            // message may not have inline keyboard
        }
    });

    bot.action('gpt:back', async (ctx) => {
        if (!ctx.from) return;

        const user = await deps.userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );
        if (!user) return;

        const i18n = getI18nForUser(user);
        const session = getSession(ctx);
        ensureGptSession(session);

        await ctx.answerCbQuery();
        await ctx.reply(i18n.gptChat.controlsHint, {
            ...generateGptControlKeyboard(i18n, {
                webSearch: session.ai?.gptWebSearch !== false,
                replyMode: session.ai?.gptReplyMode ?? 'text',
            }),
            parse_mode: 'HTML',
        });
    });
};
