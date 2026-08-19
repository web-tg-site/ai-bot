import sharp from 'sharp';
import {
    parseSoraVideoSize,
    type SoraVideoSize,
} from '@/common/utils/sora-video-params';

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
