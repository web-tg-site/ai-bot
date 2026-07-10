/** Portrait / vertical formats (shown first in picker). */
export const PORTRAIT_ASPECT_RATIOS = ['4:5', '3:4', '2:3', '9:16'] as const;

/** Landscape / square formats (shown after portrait group). */
export const LANDSCAPE_ASPECT_RATIOS = [
    '21:9',
    '16:9',
    '3:2',
    '4:3',
    '5:4',
    '1:1',
] as const;

export const STANDARD_ASPECT_RATIOS = [
    ...PORTRAIT_ASPECT_RATIOS,
    ...LANDSCAPE_ASPECT_RATIOS,
] as const;

/** Единый список форматов для пикера в боте (изображения и видео). */
export const UI_ASPECT_RATIOS = [...STANDARD_ASPECT_RATIOS] as const;

export type StandardAspectRatio = (typeof STANDARD_ASPECT_RATIOS)[number];

const ASPECT_RATIO_LABELS_RU: Record<string, string> = {
    '4:5': 'лента',
    '3:4': 'вертикаль классика',
    '2:3': 'портрет',
    '9:16': 'сторис',
    '21:9': 'эксклюзив',
    '16:9': 'широкий экран',
    '3:2': 'фото',
    '4:3': 'классика',
    '5:4': 'печать (5×4)',
    '1:1': 'квадрат',
};

const ASPECT_RATIO_LABELS_EN: Record<string, string> = {
    '4:5': 'Feed (Portrait)',
    '3:4': 'Vertical classic',
    '2:3': 'Portrait',
    '9:16': 'Story (Vertical)',
    '21:9': 'Exclusive',
    '16:9': 'Widescreen',
    '3:2': 'Photo',
    '4:3': 'Classic',
    '5:4': 'Print (5x4)',
    '1:1': 'Square',
};

export function getAspectRatioLabel(
    ratio: string,
    locale: 'ru-RU' | 'en-US',
): string {
    const labels =
        locale === 'ru-RU' ? ASPECT_RATIO_LABELS_RU : ASPECT_RATIO_LABELS_EN;
    return labels[ratio] ?? ratio;
}

/** Button / picker label: `9:16 сторис` */
export function formatAspectRatioLabel(
    ratio: string,
    locale: 'ru-RU' | 'en-US',
): string {
    const label = getAspectRatioLabel(ratio, locale);
    return label === ratio ? ratio : `${ratio} ${label}`;
}

/** Toolbar label: `📐 9:16 сторис` */
export function formatAspectRatioToolbarLabel(
    ratio: string,
    locale: 'ru-RU' | 'en-US',
): string {
    return `📐 ${formatAspectRatioLabel(ratio, locale)}`;
}

export function orderAspectRatios(allowed: string[]): string[] {
    const allowedSet = new Set(allowed);
    return STANDARD_ASPECT_RATIOS.filter((ratio) => allowedSet.has(ratio));
}

/**
 * UI aspect-ratio list: always use the curated static list per tool.
 * OpenRouter capabilities often expose incomplete enums (e.g. only 9:16).
 */
export function resolveUiAspectRatios(
    staticRatios: readonly string[],
): string[] {
    return orderAspectRatios([...staticRatios]);
}

/**
 * @deprecated Prefer resolveUiAspectRatios for UI; kept for API merge fallbacks.
 */
export function mergeAspectRatioOptions(
    apiRatios: string[],
    staticRatios?: readonly string[],
    minExpected = 3,
): string[] {
    if (staticRatios?.length) {
        if (!apiRatios.length || apiRatios.length < minExpected) {
            return orderAspectRatios([...staticRatios]);
        }

        const union = [...new Set([...staticRatios, ...apiRatios])];
        return orderAspectRatios(union);
    }

    if (apiRatios.length) {
        return orderAspectRatios(apiRatios);
    }

    return orderAspectRatios([...STANDARD_ASPECT_RATIOS]);
}

export function normalizeAspectRatioFromList(
    aspectRatio: string | undefined,
    allowed: string[],
): string {
    const ordered = orderAspectRatios(
        allowed.length ? allowed : [...STANDARD_ASPECT_RATIOS],
    );
    if (aspectRatio && ordered.includes(aspectRatio)) {
        return aspectRatio;
    }
    return ordered[0] ?? '16:9';
}
