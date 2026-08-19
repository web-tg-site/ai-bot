import { AiFileInput } from '@/common/services/ai/types';
import {
    isAudioMedia,
    isImageMedia,
    isVideoMedia,
} from '@/common/utils/media-kind';

const MIME_BY_EXT: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    m4v: 'video/mp4',
    mkv: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    aac: 'audio/aac',
    flac: 'audio/flac',
};

const mimeFromFileName = (
    fileName: string | undefined,
    fallback: string,
): string => {
    const match = fileName?.match(/\.(\w+)$/i);
    if (!match) {
        return fallback;
    }
    return MIME_BY_EXT[match[1].toLowerCase()] ?? fallback;
};

const hasNormalizedMimePrefix = (mimeType: string | undefined): boolean => {
    const lower = mimeType?.toLowerCase() ?? '';
    return (
        lower.startsWith('image/') ||
        lower.startsWith('video/') ||
        lower.startsWith('audio/') ||
        lower === 'application/ogg'
    );
};

/** Normalize Telegram / browser uploads where MIME is missing or generic. */
export function normalizeUploadMime(file: AiFileInput): AiFileInput {
    if (hasNormalizedMimePrefix(file.mimeType)) {
        return file;
    }

    if (isVideoMedia(file.mimeType, file.fileName)) {
        return {
            ...file,
            mimeType: mimeFromFileName(file.fileName, 'video/mp4'),
        };
    }

    if (isImageMedia(file.mimeType, file.fileName)) {
        return {
            ...file,
            mimeType: mimeFromFileName(file.fileName, 'image/jpeg'),
        };
    }

    if (isAudioMedia(file.mimeType, file.fileName)) {
        return {
            ...file,
            mimeType: mimeFromFileName(file.fileName, 'audio/mpeg'),
        };
    }

    return file;
}

export function splitMediaFiles(files: AiFileInput[] | undefined): {
    images: AiFileInput[];
    videos: AiFileInput[];
    audios: AiFileInput[];
} {
    const list = files ?? [];
    return {
        images: list.filter((file) =>
            isImageMedia(file.mimeType, file.fileName),
        ),
        videos: list.filter((file) =>
            isVideoMedia(file.mimeType, file.fileName),
        ),
        audios: list.filter((file) =>
            isAudioMedia(file.mimeType, file.fileName),
        ),
    };
}
