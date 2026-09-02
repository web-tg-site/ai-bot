import type { ApiframeResultJson } from '@/common/config/apiframe.config';

type InlineButton = { text: string; callback_data: string };

/** Midjourney grid: выбор кадра #1–#4 */
export function buildMjGridActionKeyboard(jobId: string): InlineButton[][] {
    return [
        [1, 2, 3, 4].map((i) => ({
            text: `#${i}`,
            callback_data: `ai:mj:upsample:${i}:${jobId}`,
        })),
    ];
}

/** Suno tracks: actions per track */
export function buildSunoActionKeyboard(
    jobId: string,
    trackCount = 2,
    options?: { stemsOnly?: boolean },
): InlineButton[][] {
    if (options?.stemsOnly) {
        return [];
    }

    const rows: InlineButton[][] = [];
    const n = Math.min(Math.max(trackCount, 1), 2);

    for (let i = 1; i <= n; i++) {
        rows.push([
            {
                text: `Extend T${i}`,
                callback_data: `ai:suno:extend:${i}:${jobId}`,
            },
            {
                text: `Cover T${i}`,
                callback_data: `ai:suno:cover:${i}:${jobId}`,
            },
        ]);
        rows.push([
            {
                text: `Vocals T${i}`,
                callback_data: `ai:suno:add_vocals:${i}:${jobId}`,
            },
            {
                text: `Stems T${i}`,
                callback_data: `ai:suno:stems:${i}:${jobId}`,
            },
        ]);
    }

    return rows;
}

export function buildApiframeResultKeyboard(
    jobId: string,
    resultJson?: ApiframeResultJson | null,
): InlineButton[][] {
    if (!resultJson) {
        return [];
    }

    switch (resultJson.kind) {
        case 'midjourney_grid':
            return buildMjGridActionKeyboard(jobId);
        case 'midjourney_single':
            return [];
        case 'suno_tracks':
            return buildSunoActionKeyboard(
                jobId,
                resultJson.tracks?.length ?? 2,
            );
        case 'suno_stems':
            return [];
        default:
            return [];
    }
}
