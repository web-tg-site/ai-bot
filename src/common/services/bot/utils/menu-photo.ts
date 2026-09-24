import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { Context } from 'telegraf';
import { ExtraReplyMessage } from 'node_modules/telegraf/typings/telegram-types';
import { AiToolId } from '@/common/services/ai';
import { replyHtmlChunks } from './telegram-html-reply';

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

/** Photo with tool title as caption; instruction/body as a follow-up message. */
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

    const splitAt = text.indexOf('\n\n');
    const title = splitAt === -1 ? text : text.slice(0, splitAt).trimEnd();
    const body = splitAt === -1 ? '' : text.slice(splitAt + 2).trimStart();

    const source = createReadStream(getPublicAssetPath(filename));
    const caption =
        title.length <= TELEGRAM_CAPTION_MAX_LENGTH ? title : undefined;
    const followUp = body || (caption ? '' : text);

    await ctx.replyWithPhoto(
        { source },
        {
            ...(caption ? { caption, parse_mode: 'HTML' as const } : undefined),
            ...(!followUp && extra ? extra : {}),
        },
    );

    if (followUp) {
        await replyHtmlChunks(ctx, followUp, extra);
    }
}
