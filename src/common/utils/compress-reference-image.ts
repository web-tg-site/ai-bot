import { AiFileInput } from '@/common/services/ai/types';

const MAX_REFERENCE_BYTES = 1_500_000;
const MAX_REFERENCE_DIMENSION = 1920;
const JPEG_QUALITY = 82;

/**
 * Compresses large reference images before session storage / API upload.
 * Falls back to the original file when compression is unavailable.
 */
export async function compressReferenceImage(
    file: AiFileInput,
): Promise<AiFileInput> {
    if (!file.mimeType.startsWith('image/')) {
        return file;
    }

    if (file.buffer.byteLength <= MAX_REFERENCE_BYTES) {
        return file;
    }

    try {
        const sharp = (await import('sharp')).default;
        const compressed = await sharp(file.buffer)
            .rotate()
            .resize({
                width: MAX_REFERENCE_DIMENSION,
                height: MAX_REFERENCE_DIMENSION,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
            .toBuffer();

        return {
            buffer: compressed,
            mimeType: 'image/jpeg',
            fileName:
                file.fileName?.replace(/\.\w+$/, '.jpg') ?? 'reference.jpg',
        };
    } catch {
        if (file.buffer.byteLength > MAX_REFERENCE_BYTES * 3) {
            throw new Error(
                'Изображение слишком большое. Отправьте файл меньшего размера.',
            );
        }

        return file;
    }
}
