import { AiFileInput } from '@/common/services/ai/types';
import { MAX_GPT_IMAGE_BYTES } from '@/common/utils/gpt-message-content';

const MAX_REFERENCE_BYTES = 1_500_000;
const MAX_REFERENCE_DIMENSION = 1920;
const JPEG_QUALITY = 82;
const GPT_HISTORY_DIMENSION = 1600;
const GPT_HISTORY_QUALITIES = [82, 70, 58, 45] as const;

const HEIC_BRANDS = new Set([
    'heic',
    'heif',
    'heix',
    'hevc',
    'hevx',
    'mif1',
    'msf1',
]);

const PROVIDER_SAFE_MIME = /^(image\/jpeg|image\/png|image\/webp)$/i;

const isHeicMimeOrName = (mimeType: string, fileName?: string): boolean => {
    const mime = mimeType.toLowerCase();
    const name = (fileName ?? '').toLowerCase();
    return (
        mime === 'image/heic' ||
        mime === 'image/heif' ||
        name.endsWith('.heic') ||
        name.endsWith('.heif')
    );
};

const bufferLooksLikeHeic = (buffer: Buffer): boolean => {
    if (buffer.length < 12) return false;
    if (buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
    return HEIC_BRANDS.has(buffer.toString('ascii', 8, 12));
};

const isHeicLike = (file: AiFileInput): boolean =>
    isHeicMimeOrName(file.mimeType, file.fileName) ||
    bufferLooksLikeHeic(file.buffer);

const toJpegFileName = (fileName?: string): string =>
    fileName?.replace(/\.\w+$/i, '.jpg') ?? 'reference.jpg';

type HeicConvertFn = (options: {
    buffer: Buffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
}) => Promise<ArrayBuffer>;

const loadHeicConvert = async (): Promise<HeicConvertFn> => {
    const mod = await import('heic-convert');
    const convert = (mod as { default?: HeicConvertFn }).default ?? mod;
    return convert as HeicConvertFn;
};

const convertHeicToJpeg = async (file: AiFileInput): Promise<AiFileInput> => {
    const convert = await loadHeicConvert();
    const output = await convert({
        buffer: file.buffer,
        format: 'JPEG',
        quality: 0.9,
    });

    return {
        buffer: Buffer.from(output),
        mimeType: 'image/jpeg',
        fileName: toJpegFileName(file.fileName),
    };
};

const resizeToJpeg = async (file: AiFileInput): Promise<AiFileInput> => {
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
        fileName: toJpegFileName(file.fileName),
    };
};

/**
 * Compresses / normalizes reference images before session storage / API upload.
 * HEIC/HEIF is converted via heic-convert (sharp prebuilds omit HEVC).
 * Other rasters are JPEG-normalized when oversized or not provider-safe.
 */
export async function compressReferenceImage(
    file: AiFileInput,
): Promise<AiFileInput> {
    let working = file;

    if (isHeicLike(working)) {
        try {
            working = await convertHeicToJpeg(working);
        } catch {
            throw new Error(
                'Не удалось обработать HEIC-фото. Попробуйте ещё раз или сохраните снимок как JPEG в Фото.',
            );
        }
    }

    const looksLikeRaster =
        working.mimeType.startsWith('image/') || isHeicLike(working);
    if (!looksLikeRaster) {
        return working;
    }

    const needsNormalize =
        working.buffer.byteLength > MAX_REFERENCE_BYTES ||
        !PROVIDER_SAFE_MIME.test(working.mimeType) ||
        isHeicLike(working);

    if (!needsNormalize) {
        return working;
    }

    try {
        return await resizeToJpeg(working);
    } catch {
        // Sharp prebuilds cannot decode HEVC-HEIC; try libheif as a last resort.
        if (working === file || isHeicLike(working)) {
            try {
                const converted = await convertHeicToJpeg(working);
                try {
                    return await resizeToJpeg(converted);
                } catch {
                    return converted;
                }
            } catch {
                // continue
            }
        }

        if (isHeicLike(working)) {
            throw new Error(
                'Не удалось обработать HEIC-фото. Попробуйте ещё раз или сохраните снимок как JPEG в Фото.',
            );
        }

        if (working.buffer.byteLength > MAX_REFERENCE_BYTES * 3) {
            throw new Error(
                'Изображение слишком большое. Отправьте файл меньшего размера.',
            );
        }

        return working;
    }
}

/**
 * Compresses an image so it fits GPT chat-history reload limits.
 * Images already under the limit are returned unchanged.
 */
export async function compressGptHistoryImage(
    file: AiFileInput,
    maxBytes: number = MAX_GPT_IMAGE_BYTES,
): Promise<AiFileInput> {
    let working = file;

    if (isHeicLike(working)) {
        try {
            working = await convertHeicToJpeg(working);
        } catch {
            // keep original and try sharp below
        }
    }

    if (!working.mimeType.startsWith('image/')) {
        return working;
    }

    if (working.buffer.byteLength <= maxBytes) {
        return working;
    }

    try {
        const sharp = (await import('sharp')).default;
        let best: Buffer | null = null;

        for (const quality of GPT_HISTORY_QUALITIES) {
            const compressed = await sharp(working.buffer)
                .rotate()
                .resize({
                    width: GPT_HISTORY_DIMENSION,
                    height: GPT_HISTORY_DIMENSION,
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .jpeg({ quality, mozjpeg: true })
                .toBuffer();

            best = compressed;
            if (compressed.byteLength <= maxBytes) {
                break;
            }
        }

        if (!best) {
            return working;
        }

        return {
            buffer: best,
            mimeType: 'image/jpeg',
            fileName: toJpegFileName(working.fileName),
        };
    } catch {
        return working;
    }
}
