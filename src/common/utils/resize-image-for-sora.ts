import sharp from 'sharp';
import {
    parseSoraVideoSize,
    type SoraReferenceImage,
    type SoraVideoSize,
} from '@/common/utils/sora-video-params';

export async function readSoraReferenceImageDimensions(
    buffer: Buffer,
): Promise<SoraReferenceImage> {
    const meta = await sharp(buffer).rotate().metadata();
    if (!meta.width || !meta.height) {
        throw new Error('Не удалось определить размер фото-референса для Sora');
    }

    return { width: meta.width, height: meta.height };
}

export async function resizeImageForSora(
    buffer: Buffer,
    size: SoraVideoSize,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const { width, height } = parseSoraVideoSize(size);

    const resized = await sharp(buffer)
        .rotate()
        .resize(width, height, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 90 })
        .toBuffer();

    return {
        buffer: resized,
        mimeType: 'image/jpeg',
        fileName: 'sora-reference.jpg',
    };
}
