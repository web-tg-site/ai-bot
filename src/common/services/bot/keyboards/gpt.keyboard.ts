import { Markup } from 'telegraf';
import { GptReplyMode } from '@/common/services/ai/types';
import { I18nBundle } from '../i18n';

const PAGE_SIZE = 8;

export function generateGptControlKeyboard(
    i18n: I18nBundle,
    options: {
        webSearch: boolean;
        replyMode: GptReplyMode;
    },
) {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(i18n.gptChat.newChat, 'gpt:new'),
            Markup.button.callback(i18n.gptChat.myChats, 'gpt:list:0'),
        ],
        [
            Markup.button.callback(i18n.gptChat.clearHistory, 'gpt:clear'),
            Markup.button.callback(
                options.webSearch
                    ? i18n.gptChat.webSearchOn
                    : i18n.gptChat.webSearchOff,
                `gpt:web_search:${options.webSearch ? 'off' : 'on'}`,
            ),
        ],
        [
            Markup.button.callback(
                i18n.gptChat.replyModeLabel(options.replyMode),
                'gpt:reply_mode',
            ),
        ],
    ]);
}

export function generateGptClearConfirmKeyboard(i18n: I18nBundle) {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(
                i18n.gptChat.confirmClear,
                'gpt:clear:confirm',
            ),
        ],
        [Markup.button.callback(i18n.gptChat.cancelClear, 'gpt:clear:cancel')],
    ]);
}

export function generateGptChatListKeyboard(
    i18n: I18nBundle,
    conversations: Array<{ id: string; title: string }>,
    page: number,
    total: number,
) {
    const rows = conversations.map((conversation) => [
        Markup.button.callback(
            conversation.title.slice(0, 64),
            `gpt:open:${conversation.id}`,
        ),
    ]);

    const navButtons: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0) {
        navButtons.push(Markup.button.callback('◀️', `gpt:list:${page - 1}`));
    }
    if ((page + 1) * PAGE_SIZE < total) {
        navButtons.push(Markup.button.callback('▶️', `gpt:list:${page + 1}`));
    }
    if (navButtons.length) {
        rows.push(navButtons);
    }

    rows.push([Markup.button.callback(i18n.buttons.back, 'gpt:back')]);

    return Markup.inlineKeyboard(rows);
}

export const GPT_CHAT_LIST_PAGE_SIZE = PAGE_SIZE;
