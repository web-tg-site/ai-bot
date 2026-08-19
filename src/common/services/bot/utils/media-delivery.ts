import { Context } from 'telegraf';
import { AiGenerationResult } from '@/common/services/ai/types';
import { AiToolId } from '@/common/services/ai/types';
import {
    downloadRemoteFile,
    getAuthHeadersForUrl,
} from '@/common/utils/download-remote-file';
import {
    mimeTypeToExtension,
    parseDataUrl,
} from '@/common/utils/parse-data-url';
import { resolveSendAsFile } from '@/common/utils/resolve-send-as-file';
import { bufferToInputFile } from './download-telegram-file';
import { remuxVideoForTelegram } from './remux-telegram-video';

type BotContext = Context;

export async function sendGenerationResultWithDelivery(
    ctx: BotContext,
    result: AiGenerationResult,
    toolId: AiToolId,
    sendAsFile: boolean,
    caption?: string,
) {
    if (result.type === 'text' && result.text) {
        return;
    }

    if (result.type === 'audio' && result.buffer) {
        await sendAudioBuffer(ctx, result.buffer, result.mimeType, sendAsFile);
        return;
    }

    if (result.url) {
        const parsed = parseDataUrl(result.url);
        if (result.type === 'image') {
            if (parsed) {
                await sendImageBuffer(
                    ctx,
                    parsed.buffer,
                    parsed.mimeType,
                    sendAsFile,
                    caption,
                );
                return;
            }
            if (sendAsFile) {
                const { buffer, mimeType } = await downloadRemoteFile(
                    result.url,
                    getAuthHeadersForUrl(result.url),
                );
                await sendImageBuffer(ctx, buffer, mimeType, true, caption);
                return;
            }
            await ctx.replyWithPhoto(result.url, caption ? { caption } : undefined);
            return;
        }

        if (result.type === 'video') {
            if (parsed) {
                await sendVideoBuffer(
                    ctx,
                    parsed.buffer,
                    parsed.mimeType,
                    sendAsFile,
                    caption,
                );
                return;
            }
            const { buffer, mimeType } = await downloadRemoteFile(
                result.url,
                getAuthHeadersForUrl(result.url),
            );
            await sendVideoBuffer(ctx, buffer, mimeType, sendAsFile, caption);
            return;
        }

        if (result.type === 'audio') {
            const { buffer, mimeType } = await downloadRemoteFile(
                result.url,
                getAuthHeadersForUrl(result.url),
            );
            await sendAudioBuffer(ctx, buffer, mimeType, sendAsFile);
        }
        return;
    }

    if (result.buffer) {
        if (result.type === 'image') {
            await sendImageBuffer(
                ctx,
                result.buffer,
                result.mimeType ?? 'image/png',
                sendAsFile,
                caption,
            );
        } else if (result.type === 'video') {
            await sendVideoBuffer(
                ctx,
                result.buffer,
                result.mimeType ?? 'video/mp4',
                sendAsFile,
                caption,
            );
        } else if (result.type === 'audio') {
            await sendAudioBuffer(
                ctx,
                result.buffer,
                result.mimeType ?? 'audio/mpeg',
                sendAsFile,
            );
        }
    }
}

export async function sendImageBuffer(
    ctx: BotContext,
    buffer: Buffer,
    mimeType: string,
    sendAsFile: boolean,
    caption?: string,
) {
    const ext = mimeTypeToExtension(mimeType, 'png');
    const inputFile = bufferToInputFile(buffer, `image.${ext}`);
    const extra = caption ? { caption } : undefined;
    if (sendAsFile) {
        await ctx.replyWithDocument(inputFile, extra);
        return;
    }
    await ctx.replyWithPhoto(inputFile, extra);
}

export async function sendVideoBuffer(
    ctx: BotContext,
    buffer: Buffer,
    mimeType: string,
    sendAsFile: boolean,
    caption?: string,
) {
    await deliverVideoBuffer(
        {
            sendVideo: (file, extra) =>
                ctx.replyWithVideo(file, { ...extra, ...(caption ? { caption } : {}) }),
            sendDocument: (file) =>
                ctx.replyWithDocument(file, caption ? { caption } : undefined),
        },
        buffer,
        mimeType,
        sendAsFile,
    );
}

export async function deliverVideoBuffer(
    api: {
        sendVideo: (
            file: ReturnType<typeof bufferToInputFile>,
            extra?: { supports_streaming?: boolean },
        ) => Promise<unknown>;
        sendDocument: (
            file: ReturnType<typeof bufferToInputFile>,
        ) => Promise<unknown>;
    },
    buffer: Buffer,
    mimeType: string,
    sendAsFile: boolean,
) {
    let payload = buffer;
    try {
        payload = await remuxVideoForTelegram(buffer);
    } catch {
        payload = buffer;
    }

    const ext = mimeTypeToExtension(mimeType, 'mp4');
    const inputFile = bufferToInputFile(payload, `video.${ext}`);
    if (sendAsFile) {
        await api.sendDocument(inputFile);
        return;
    }

    try {
        await api.sendVideo(inputFile, { supports_streaming: true });
    } catch {
        await api.sendDocument(inputFile);
    }
}

export async function sendAudioBuffer(
    ctx: BotContext,
    buffer: Buffer,
    mimeType: string | undefined,
    sendAsFile: boolean,
) {
    const ext = mimeTypeToExtension(mimeType ?? 'audio/mpeg', 'mp3');
    if (sendAsFile) {
        await ctx.replyWithAudio(bufferToInputFile(buffer, `audio.${ext}`));
        return;
    }
    await ctx.replyWithVoice(bufferToInputFile(buffer, `voice.${ext}`));
}

export function isAudioTool(toolId: AiToolId): boolean {
    return (
        toolId === AiToolId.ELEVENLABS_VOICE ||
        toolId === AiToolId.VOICE_CLONE ||
        toolId === AiToolId.SOUND_GENERATOR ||
        toolId === AiToolId.SUNO
    );
}

export function resolveToolSendAsFile(
    toolId: AiToolId,
    settings?: { sendAsFile?: boolean } | null,
): boolean {
    return resolveSendAsFile(toolId, settings);
}
