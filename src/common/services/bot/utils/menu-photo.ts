import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { Context } from 'telegraf';
import { ExtraReplyMessage } from 'node_modules/telegraf/typings/telegram-types';
import { AiToolId } from '@/common/services/ai';
import { replyHtmlChunks, splitTelegramMessage } from './telegram-html-reply';

const TELEGRAM_CAPTION_MAX_LENGTH = 1024;

/** Relative to `common/public/`. */
export const AI_TOOL_PHOTO: Partial<Record<AiToolId, string>> = {
    [AiToolId.GPT]: 'ai/ChatGpt.png',
    [AiToolId.CLAUDE_SONNET]: 'ai/Claude.png',
    [AiToolId.GPT_IMAGES]: 'ai/Sora.png',
    [AiToolId.FLUX]: 'ai/Flux.png',
    [AiToolId.NANO_BANANA]: 'ai/Nano Banana.png',
    [AiToolId.SEEDREAM]: 'ai/Seedream.png',
    [AiToolId.MIDJOURNEY]: 'ai/Midjourney.png',
    [AiToolId.KLING]: 'ai/Kling.png',
    [AiToolId.KLING_MOTION]: 'ai/Kling Motion.png',
    [AiToolId.VEO]: 'ai/Veo.png',
    [AiToolId.SEEDANCE]: 'ai/Seedance.png',
    [AiToolId.LUMA_RAY]: 'ai/Luma Ray.png',
    [AiToolId.HIGGSFIELD]: 'ai/Higgsfield.png',
    [AiToolId.HEYGEN]: 'ai/HeyGen.png',
    [AiToolId.TOPAZ]: 'ai/Topaz AI.png',
    [AiToolId.ELEVENLABS_VOICE]: 'ai/evenlabs.png',
    [AiToolId.VOICE_CLONE]: 'ai/el-clone.png',
    [AiToolId.VIDEO_TO_AUDIO]: 'ai/el-video.png',
    [AiToolId.SOUND_GENERATOR]: 'ai/el-effects.png',
    [AiToolId.SUNO]: 'ai/Suno.png',
};

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

/** Photo + HTML text (chunked). Keyboard goes on the last text/caption message. */
export async function replyToolMenuPhoto(
    ctx: Context,
    toolId: AiToolId,
    text: string,
    extra?: ExtraReplyMessage,
) {
    const filename = AI_TOOL_PHOTO[toolId];
    if (!filename) {
        await replyHtmlChunks(ctx, text, extra);
        return;
    }

    const parts = splitTelegramMessage(text);
    const source = createReadStream(getPublicAssetPath(filename));

    if (parts.length === 1 && parts[0].length <= TELEGRAM_CAPTION_MAX_LENGTH) {
        await ctx.replyWithPhoto(
            { source },
            {
                caption: parts[0],
                parse_mode: 'HTML',
                ...extra,
            },
        );
        return;
    }

    await ctx.replyWithPhoto({ source });
    await replyHtmlChunks(ctx, text, extra);
}
