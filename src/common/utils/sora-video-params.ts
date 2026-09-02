export type SoraVideoSize =
    | '720x1280'
    | '1280x720'
    | '1024x1792'
    | '1792x1024';

export type SoraCreateSeconds = '4' | '8' | '12';

export const SORA_CREATE_DURATIONS = [4, 8, 12] as const;
export const SORA_EXTEND_DURATIONS = [4, 8, 12, 16, 20] as const;

const PORTRAIT_ASPECT_RATIOS = new Set(['4:5', '3:4', '2:3', '9:16']);

export type SoraReferenceImage = {
    width: number;
    height: number;
};

export function isPortraitAspectRatio(
    aspectRatio?: string,
    referenceImage?: SoraReferenceImage,
): boolean {
    if (!aspectRatio) {
        return false;
    }
    if (PORTRAIT_ASPECT_RATIOS.has(aspectRatio)) {
        return true;
    }
    const [w, h] = aspectRatio.split(':').map(Number);
    if (w && h) {
        if (h > w) {
            return true;
        }
        if (w > h) {
            return false;
        }
        if (referenceImage) {
            return referenceImage.height >= referenceImage.width;
        }
        return true;
    }
    return false;
}

export function resolveSoraOutputAspectRatio(
    aspectRatio?: string,
    referenceImage?: SoraReferenceImage,
): '9:16' | '16:9' {
    return isPortraitAspectRatio(aspectRatio, referenceImage)
        ? '9:16'
        : '16:9';
}

export function resolveSoraVideoSize(
    aspectRatio?: string,
    resolution?: string,
    referenceImage?: SoraReferenceImage,
): SoraVideoSize {
    const portrait = isPortraitAspectRatio(aspectRatio, referenceImage);
    const is1080 = resolution === '1080p';

    if (portrait) {
        return is1080 ? '1024x1792' : '720x1280';
    }

    return is1080 ? '1792x1024' : '1280x720';
}

export function parseSoraVideoSize(size: SoraVideoSize): {
    width: number;
    height: number;
} {
    const [width, height] = size.split('x').map(Number);
    return { width, height };
}

export function resolveSoraModel(
    quality?: string,
    resolution?: string,
): 'sora-2' | 'sora-2-pro' {
    if (quality === 'high' || resolution === '1080p') {
        return 'sora-2-pro';
    }
    return 'sora-2';
}

export function toSoraCreateSeconds(
    durationSeconds?: number,
): SoraCreateSeconds {
    if (durationSeconds === 4 || durationSeconds === 8 || durationSeconds === 12) {
        return String(durationSeconds) as SoraCreateSeconds;
    }

    throw new Error('Длительность Sora: только 4, 8 или 12 секунд');
}

export function toSoraExtendSeconds(durationSeconds?: number): string {
    if (
        durationSeconds === 4 ||
        durationSeconds === 8 ||
        durationSeconds === 12 ||
        durationSeconds === 16 ||
        durationSeconds === 20
    ) {
        return String(durationSeconds);
    }

    throw new Error(
        'Длительность продления Sora: только 4, 8, 12, 16 или 20 секунд',
    );
}

export function isSoraCreateDuration(durationSeconds: number): boolean {
    return (SORA_CREATE_DURATIONS as readonly number[]).includes(
        durationSeconds,
    );
}

export function isSoraExtendDuration(durationSeconds: number): boolean {
    return (SORA_EXTEND_DURATIONS as readonly number[]).includes(
        durationSeconds,
    );
}
