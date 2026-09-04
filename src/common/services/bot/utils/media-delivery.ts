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
            await ctx.replyWithPhoto(
                result.url,
                caption ? { caption } : undefined,
            );
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
                ctx.replyWithVideo(file, {
                    ...extra,
                    ...(caption ? { caption } : {}),
                }),
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
    // Safety net: pure audio containers must not go through video remux/sendVideo.
    // Do not treat every audio/* label as audio — some CDNs mark MP4 with picture as audio/mp4.
    const lowerMime = mimeType.toLowerCase();
    const audioOnly =
        looksLikeMp3(buffer) ||
        looksLikeAudioOnlyMp4(buffer) ||
        (lowerMime.startsWith('audio/') &&
            !looksLikeMp4(buffer) &&
            !lowerMime.includes('mp4'));
    if (audioOnly) {
        const audioExt = mimeTypeToExtension(
            lowerMime.startsWith('audio/') ? mimeType : 'audio/mpeg',
            'mp3',
        );
        await api.sendDocument(bufferToInputFile(buffer, `audio.${audioExt}`));
        return;
    }

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

function looksLikeMp4(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
}

function looksLikeMp3(buffer: Buffer): boolean {
    if (buffer.length < 3) return false;
    if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return true;
    return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function looksLikeAudioOnlyMp4(buffer: Buffer): boolean {
    if (!looksLikeMp4(buffer) || buffer.length < 12) return false;
    if (hasMp4VideoTrack(buffer)) return false;
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'mp4a') return true;
    const head = buffer
        .subarray(8, Math.min(buffer.length, 64))
        .toString('ascii');
    return head.includes('M4A ') || head.includes('M4B ');
}

function hasMp4VideoTrack(buffer: Buffer): boolean {
    if (!looksLikeMp4(buffer)) return false;
    const limit = Math.min(buffer.length - 20, 4 * 1024 * 1024);
    for (let i = 0; i < limit; i++) {
        if (
            buffer[i] === 0x68 &&
            buffer[i + 1] === 0x64 &&
            buffer[i + 2] === 0x6c &&
            buffer[i + 3] === 0x72
        ) {
            const handler = buffer.subarray(i + 16, i + 20).toString('ascii');
            if (handler === 'vide') return true;
        }
    }
    return false;
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
