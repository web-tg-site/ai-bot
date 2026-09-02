import { AiFileInput } from '@/common/services/ai/types';

const GPT_MEDIA_MARKER = '"_gptMedia":true';
const MAX_STORED_GPT_IMAGES = 2;
/** Max raw image bytes kept in GPT chat history (must match compress target). */
export const MAX_GPT_IMAGE_BYTES = 800_000;

type StoredGptMediaMessage = {
    _gptMedia: true;
    text?: string;
    attachments?: Array<{
        mimeType: string;
        data: string;
        fileName?: string;
    }>;
    /** Optional completed job id for Telegram / download helpers. */
    jobId?: string;
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

    return stringifyGptMediaMessage({
        text: combinedText || undefined,
        files: imageFiles,
    });
}

/** Persist assistant reply that may include generated images. */
export function serializeGptAssistantMessage(
    text: string | undefined,
    files?: AiFileInput[],
    jobId?: string,
): string {
    const trimmed = text?.trim();
    const imageFiles =
        files?.filter((file) => file.mimeType.startsWith('image/')) ?? [];

    if (!imageFiles.length) {
        return trimmed || '';
    }

    return stringifyGptMediaMessage({
        text: trimmed || undefined,
        files: imageFiles,
        jobId,
    });
}

function stringifyGptMediaMessage(params: {
    text?: string;
    files: AiFileInput[];
    jobId?: string;
}): string {
    const attachments = params.files.slice(0, MAX_STORED_GPT_IMAGES).map((file) => ({
        mimeType: file.mimeType,
        data: file.buffer.toString('base64'),
        fileName: file.fileName,
    }));

    const payload: StoredGptMediaMessage = {
        _gptMedia: true,
        text: params.text,
        attachments,
        ...(params.jobId ? { jobId: params.jobId } : {}),
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

export function parseGptMediaMessage(content: string): {
    text: string;
    files?: AiFileInput[];
    jobId?: string;
} {
    if (!content.includes(GPT_MEDIA_MARKER)) {
        return { text: content };
    }

    try {
        const parsed = JSON.parse(content) as StoredGptMediaMessage;
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
            text: parsed.text?.trim() || '',
            files: files.length ? files : undefined,
            jobId: parsed.jobId?.trim() || undefined,
        };
    } catch {
        return { text: content };
    }
}

/** @deprecated Prefer parseGptMediaMessage — kept for call-site compatibility. */
export function parseGptUserMessage(content: string): {
    text: string;
    files?: AiFileInput[];
    jobId?: string;
} {
    const parsed = parseGptMediaMessage(content);
    return {
        ...parsed,
        // Legacy callers expect a placeholder when the user sent only images.
        text: parsed.text || (parsed.files?.length ? '[image]' : ''),
    };
}

export function toDataUrl(file: AiFileInput): string {
    return `data:${file.mimeType || 'image/jpeg'};base64,${file.buffer.toString('base64')}`;
}
