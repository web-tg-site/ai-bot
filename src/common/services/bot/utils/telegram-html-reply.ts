import { Context } from 'telegraf';

export const TELEGRAM_MESSAGE_LIMIT = 4096;

export function splitTelegramMessage(
    text: string,
    limit = TELEGRAM_MESSAGE_LIMIT,
): string[] {
    if (text.length <= limit) {
        return [text];
    }

    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > limit) {
        let cut = remaining.lastIndexOf('\n\n', limit);
        if (cut < limit / 3) {
            cut = remaining.lastIndexOf('\n', limit);
        }
        if (cut < limit / 3) {
            cut = limit;
        }
        chunks.push(remaining.slice(0, cut).trimEnd());
        remaining = remaining.slice(cut).trimStart();
    }
    if (remaining) {
        chunks.push(remaining);
    }
    return chunks;
}

export async function replyHtmlChunks(
    ctx: Context,
    text: string,
    extra?: object,
): Promise<void> {
    const parts = splitTelegramMessage(text);
    for (let index = 0; index < parts.length; index += 1) {
        const isLast = index === parts.length - 1;
        await ctx.reply(parts[index], {
            parse_mode: 'HTML',
            ...(isLast && extra ? extra : {}),
        });
    }
}
