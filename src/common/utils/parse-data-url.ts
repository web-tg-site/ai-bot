export type ParsedDataUrl = {
    buffer: Buffer;
    mimeType: string;
};

export function parseDataUrl(url: string): ParsedDataUrl | null {
    const match = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) {
        return null;
    }

    return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], 'base64'),
    };
}

export function mimeTypeToExtension(
    mimeType: string,
    fallback = 'bin',
): string {
    const normalized = mimeType.split(';')[0].trim();
    const map: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/ogg': 'ogg',
    };

    return map[normalized] ?? fallback;
}
