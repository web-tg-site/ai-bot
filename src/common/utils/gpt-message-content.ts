import { AiFileInput } from '@/common/services/ai/types';

const GPT_MEDIA_MARKER = '"_gptMedia":true';
const MAX_STORED_GPT_IMAGES = 2;
/** Max raw image bytes kept in GPT chat history (must match compress target). */
export const MAX_GPT_IMAGE_BYTES = 800_000;

type StoredGptUserMessage = {
    _gptMedia: true;
    text?: string;
    attachments?: Array<{
        mimeType: string;
        data: string;
        fileName?: string;
    }>;
};

export function serializeGptUserMessage(
    text: string | undefined,
    files?: AiFileInput[],
): string {
    const trimmed = text?.trim();
    const imageFiles =
        files?.filter((file) => file.mimeType.startsWith('image/')) ?? [];
    const mediaNotes = describeNonImageAttachments(files);
    const combinedText = [trimmed, mediaNotes].filter(Boolean).join('\n');

    if (!imageFiles.length) {
        return combinedText;
    }

    const attachments = imageFiles
        .slice(0, MAX_STORED_GPT_IMAGES)
        .map((file) => ({
            mimeType: file.mimeType,
            data: file.buffer.toString('base64'),
            fileName: file.fileName,
        }));

    const payload: StoredGptUserMessage = {
        _gptMedia: true,
        text: combinedText || undefined,
        attachments,
    };

    return JSON.stringify(payload);
}

function describeNonImageAttachments(files?: AiFileInput[]): string {
    if (!files?.length) {
        return '';
    }

    const lines: string[] = [];
    for (const file of files) {
        if (file.mimeType.startsWith('image/')) {
            continue;
        }
        const name = file.fileName ?? 'file';
        if (file.mimeType.startsWith('video/')) {
            lines.push(`[video: ${name}]`);
        } else if (
            file.mimeType.startsWith('audio/') ||
            file.mimeType.startsWith('voice/')
        ) {
            lines.push(`[audio: ${name}]`);
        } else {
            lines.push(`[file: ${name}]`);
        }
    }
    return lines.join('\n');
}

export function parseGptUserMessage(content: string): {
    text: string;
    files?: AiFileInput[];
} {
    if (!content.includes(GPT_MEDIA_MARKER)) {
        return { text: content };
    }

    try {
        const parsed = JSON.parse(content) as StoredGptUserMessage;
        if (!parsed._gptMedia) {
            return { text: content };
        }

        const files =
            parsed.attachments
                ?.filter(
                    (attachment) =>
                        Buffer.byteLength(attachment.data, 'base64') <=
                        MAX_GPT_IMAGE_BYTES,
                )
                .map((attachment) => ({
                    buffer: Buffer.from(attachment.data, 'base64'),
                    mimeType: attachment.mimeType,
                    fileName: attachment.fileName,
                })) ?? [];

        return {
            text: parsed.text?.trim() || '[image]',
            files: files.length ? files : undefined,
        };
    } catch {
        return { text: content };
    }
}
