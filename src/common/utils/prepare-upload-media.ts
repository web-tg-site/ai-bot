import { AiFileInput } from '@/common/services/ai/types';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';
import { isImageMedia, isVideoMedia } from '@/common/utils/media-kind';
import { normalizeUploadMime } from '@/common/utils/normalize-upload-mime';
import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';

const toMp4FileName = (fileName?: string): string => {
    if (!fileName?.trim()) {
        return 'video.mp4';
    }
    return fileName.replace(/\.\w+$/i, '.mp4');
};

/**
 * Normalize inbound uploads before any AI provider sees them:
 * HEIC/HEIF → JPEG, HEVC/MOV/odd MP4 → H.264 AAC MP4.
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
