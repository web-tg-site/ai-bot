import { AiFileInput } from '@/common/services/ai/types';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';
import {
    isAudioMedia,
    isImageMedia,
    isVideoMedia,
} from '@/common/utils/media-kind';
import { normalizeUploadMime } from '@/common/utils/normalize-upload-mime';
import { transcodeAudioToMp3 } from '@/common/utils/transcode-audio-mp3';
import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';

const toMp4FileName = (fileName?: string): string => {
    if (!fileName?.trim()) {
        return 'video.mp4';
    }
    return fileName.replace(/\.\w+$/i, '.mp4');
};

const toMp3FileName = (fileName?: string): string => {
    if (!fileName?.trim()) {
        return 'audio.mp3';
    }
    return fileName.replace(/\.\w+$/i, '.mp3');
};

/**
 * Normalize inbound uploads before any AI provider sees them:
 * HEIC/HEIF → JPEG, HEVC/MOV/odd MP4 → H.264 AAC MP4,
 * OGG/M4A/AAC/FLAC/… → MP3 (HeyGen and others need MP3/WAV).
 */
export async function prepareUploadMedia(
    file: AiFileInput,
): Promise<AiFileInput> {
    const normalized = normalizeUploadMime(file);

    if (isImageMedia(normalized.mimeType, normalized.fileName)) {
        return compressReferenceImage(normalized);
    }

    if (isVideoMedia(normalized.mimeType, normalized.fileName)) {
        const buffer = await transcodeVideoToH264(normalized.buffer);
        return {
            buffer,
            mimeType: 'video/mp4',
            fileName: toMp4FileName(normalized.fileName),
        };
    }

    if (isAudioMedia(normalized.mimeType, normalized.fileName)) {
        const buffer = await transcodeAudioToMp3(normalized.buffer, {
            mimeType: normalized.mimeType,
            fileName: normalized.fileName,
        });
        // Already MP3/WAV → buffer unchanged; keep original mime/name.
        if (buffer === normalized.buffer) {
            return normalized;
        }
        return {
            buffer,
            mimeType: 'audio/mpeg',
            fileName: toMp3FileName(normalized.fileName),
        };
    }

    return normalized;
}

export async function prepareUploadMediaList(
    files: AiFileInput[] | undefined,
): Promise<AiFileInput[] | undefined> {
    if (!files?.length) {
        return files;
    }
    return Promise.all(files.map((file) => prepareUploadMedia(file)));
}
