import { Context } from 'telegraf';

/**
 * Removes a transient status message ("⏳ Генерация…") once the result is out.
 * Telegram refuses deletion for messages older than 48h or already removed —
 * those failures must never break the generation flow.
 */
export async function safeDeleteMessage(
    ctx: Context,
    messageId: number | undefined | null,
): Promise<void> {
    if (!messageId) return;

    try {
        await ctx.deleteMessage(messageId);
    } catch {
        // message already gone or too old to delete
    }
}

/** Rewrites a status message in place; ignores "message is not modified". */
export async function safeEditMessageText(
    ctx: Context,
    messageId: number | undefined | null,
    text: string,
): Promise<void> {
    if (!messageId || !ctx.chat) return;

    try {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            text,
        );
    } catch {
        // message already gone or text unchanged
    }
}
