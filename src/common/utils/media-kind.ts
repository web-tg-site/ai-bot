const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|oga|aac|flac|webm)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i;

export function isImageMedia(
    mimeType: string | undefined,
    fileName?: string,
): boolean {
    const mime = mimeType?.toLowerCase() ?? '';
    if (mime.startsWith('image/')) return true;
    if (mime === 'application/octet-stream' || !mime) {
        return IMAGE_EXT.test(fileName ?? '');
    }
    return IMAGE_EXT.test(fileName ?? '');
}

export function isVideoMedia(
    mimeType: string | undefined,
    fileName?: string,
): boolean {
    const mime = mimeType?.toLowerCase() ?? '';
    if (mime.startsWith('video/')) return true;
    if (mime === 'application/octet-stream' || !mime) {
        return VIDEO_EXT.test(fileName ?? '');
    }
    return VIDEO_EXT.test(fileName ?? '');
}

export function isAudioMedia(
    mimeType: string | undefined,
    fileName?: string,
): boolean {
    const mime = mimeType?.toLowerCase() ?? '';
    if (
        mime.startsWith('audio/') ||
        mime === 'audio/ogg' ||
        mime === 'application/ogg'
    ) {
        return true;
    }
    if (mime === 'application/octet-stream' || !mime) {
        return AUDIO_EXT.test(fileName ?? '');
    }
    return AUDIO_EXT.test(fileName ?? '');
}

export function isVisualMedia(
    mimeType: string | undefined,
    fileName?: string,
): boolean {
    return isImageMedia(mimeType, fileName) || isVideoMedia(mimeType, fileName);
}

export function fileMatchesToolAccepts(
    file: { mimeType: string; fileName?: string },
    accepts: readonly string[],
): boolean {
    if (
        accepts.includes('photo') &&
        isImageMedia(file.mimeType, file.fileName)
    ) {
        return true;
    }
    if (
        accepts.includes('video') &&
        isVideoMedia(file.mimeType, file.fileName)
    ) {
        return true;
    }
    if (
        (accepts.includes('audio') || accepts.includes('voice')) &&
        isAudioMedia(file.mimeType, file.fileName)
    ) {
        return true;
    }
    if (accepts.includes('document')) {
        return true;
    }
    return false;
}
