import { AiFileInput } from '@/common/services/ai/types';

const GPT_MEDIA_MARKER = '"_gptMedia":true';
const MAX_STORED_GPT_IMAGES = 2;
const MAX_GPT_IMAGE_BYTES = 800_000;

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

    if (!imageFiles.length) {
        if (trimmed) {
            return trimmed;
        }

        const hasNonImageMedia = files?.some(
            (file) => !file.mimeType.startsWith('image/'),
        );
        return hasNonImageMedia ? '[media]' : '';
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
        text: trimmed,
        attachments,
    };

    return JSON.stringify(payload);
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
