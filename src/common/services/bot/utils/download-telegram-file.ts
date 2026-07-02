import { Context } from 'telegraf';
import { InputFile } from 'telegraf/types';
import { AiFileInput } from '@/common/services/ai/types';

export async function downloadTelegramFile(
    ctx: Context,
    fileId: string,
    fileName?: string,
    mimeType?: string,
): Promise<AiFileInput> {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(fileLink.href);

    if (!response.ok) {
        throw new Error('Не удалось скачать файл из Telegram');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const resolvedMimeType =
        mimeType ??
        response.headers.get('content-type') ??
        'application/octet-stream';

    return {
        buffer,
        mimeType: resolvedMimeType,
        fileName,
    };
}

export async function extractFilesFromMessage(
    ctx: Context,
): Promise<AiFileInput[]> {
    const message = ctx.message;
    if (!message || !('message_id' in message)) {
        return [];
    }

    const files: AiFileInput[] = [];

    if ('photo' in message && message.photo?.length) {
        const photo = message.photo[message.photo.length - 1];
        files.push(
            await downloadTelegramFile(
                ctx,
                photo.file_id,
                'photo.jpg',
                'image/jpeg',
            ),
        );
    }

    if ('document' in message && message.document) {
        files.push(
            await downloadTelegramFile(
                ctx,
                message.document.file_id,
                message.document.file_name,
                message.document.mime_type,
            ),
        );
    }

    if ('video' in message && message.video) {
        files.push(
            await downloadTelegramFile(
                ctx,
                message.video.file_id,
                'video.mp4',
                message.video.mime_type ?? 'video/mp4',
            ),
        );
    }

    if ('voice' in message && message.voice) {
        files.push(
            await downloadTelegramFile(
                ctx,
                message.voice.file_id,
                'voice.ogg',
                message.voice.mime_type ?? 'audio/ogg',
            ),
        );
    }

    if ('audio' in message && message.audio) {
        files.push(
            await downloadTelegramFile(
                ctx,
                message.audio.file_id,
                message.audio.file_name ?? 'audio.mp3',
                message.audio.mime_type ?? 'audio/mpeg',
            ),
        );
    }

    return files;
}

export function getMessageText(ctx: Context): string | undefined {
    const message = ctx.message;
    if (!message) return undefined;

    if ('text' in message && message.text) {
        return message.text;
    }

    if ('caption' in message && message.caption) {
        return message.caption;
    }

    return undefined;
}

export function bufferToInputFile(buffer: Buffer, filename: string): InputFile {
    return { source: buffer, filename };
}
