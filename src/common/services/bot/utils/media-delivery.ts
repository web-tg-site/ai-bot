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

type BotContext = Context;

export async function sendGenerationResultWithDelivery(
    ctx: BotContext,
    result: AiGenerationResult,
    toolId: AiToolId,
    sendAsFile: boolean,
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
                );
                return;
            }
            if (sendAsFile) {
                const { buffer, mimeType } = await downloadRemoteFile(
                    result.url,
                    getAuthHeadersForUrl(result.url),
                );
                await sendImageBuffer(ctx, buffer, mimeType, true);
                return;
            }
            await ctx.replyWithPhoto(result.url);
            return;
        }

        if (result.type === 'video') {
            if (parsed) {
                await sendVideoBuffer(
                    ctx,
                    parsed.buffer,
                    parsed.mimeType,
                    sendAsFile,
                );
                return;
            }
            const { buffer, mimeType } = await downloadRemoteFile(
                result.url,
                getAuthHeadersForUrl(result.url),
            );
            await sendVideoBuffer(ctx, buffer, mimeType, sendAsFile);
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
            );
        } else if (result.type === 'video') {
            await sendVideoBuffer(
                ctx,
                result.buffer,
                result.mimeType ?? 'video/mp4',
                sendAsFile,
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
) {
    const ext = mimeTypeToExtension(mimeType, 'png');
    const inputFile = bufferToInputFile(buffer, `image.${ext}`);
    if (sendAsFile) {
        await ctx.replyWithDocument(inputFile);
        return;
    }
    await ctx.replyWithPhoto(inputFile);
}

export async function sendVideoBuffer(
    ctx: BotContext,
    buffer: Buffer,
    mimeType: string,
    sendAsFile: boolean,
) {
    const ext = mimeTypeToExtension(mimeType, 'mp4');
    const inputFile = bufferToInputFile(buffer, `video.${ext}`);
    if (sendAsFile) {
        await ctx.replyWithDocument(inputFile);
        return;
    }
    await ctx.replyWithVideo(inputFile);
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
        toolId === AiToolId.SOUND_GENERATOR
    );
}

export function resolveToolSendAsFile(
    toolId: AiToolId,
    settings?: { sendAsFile?: boolean } | null,
): boolean {
    return resolveSendAsFile(toolId, settings);
}
