import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { Context } from 'telegraf';
import { ExtraReplyMessage } from 'node_modules/telegraf/typings/telegram-types';

const TELEGRAM_CAPTION_MAX_LENGTH = 1024;

export function getPublicAssetPath(filename: string): string {
    const candidates = [
        join(process.cwd(), 'dist/src/common/public', filename),
        join(process.cwd(), 'src/common/public', filename),
        join(__dirname, '../../../public', filename),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Public asset not found: ${filename}`);
}

export async function replyMenuPhoto(
    ctx: Context,
    filename: string,
    caption: string,
    extra?: ExtraReplyMessage,
) {
    const source = createReadStream(getPublicAssetPath(filename));
    const parseModeExtra = { parse_mode: 'HTML' as const, ...extra };

    if (caption.length > TELEGRAM_CAPTION_MAX_LENGTH) {
        await ctx.replyWithPhoto({ source });
        await ctx.reply(caption, parseModeExtra);
        return;
    }

    await ctx.replyWithPhoto(
        { source },
        {
            caption,
            ...parseModeExtra,
        },
    );
}
