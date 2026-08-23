import type { ApiframeResultJson } from '@/common/config/apiframe.config';

type InlineButton = { text: string; callback_data: string };

/** Midjourney grid: U1–U4 / V1–V4 */
export function buildMjGridActionKeyboard(jobId: string): InlineButton[][] {
    return [
        [1, 2, 3, 4].map((i) => ({
            text: `U${i}`,
            callback_data: `ai:mj:upsample:${i}:${jobId}`,
        })),
        [1, 2, 3, 4].map((i) => ({
            text: `V${i}`,
            callback_data: `ai:mj:variation:${i}:${jobId}`,
        })),
    ];
}

/** Midjourney single (after upsample): pan / zoom / inpaint */
export function buildMjSingleActionKeyboard(jobId: string): InlineButton[][] {
    return [
        [
            { text: '⬅️', callback_data: `ai:mj:pan:left:${jobId}` },
            { text: '⬆️', callback_data: `ai:mj:pan:up:${jobId}` },
            { text: '⬇️', callback_data: `ai:mj:pan:down:${jobId}` },
            { text: '➡️', callback_data: `ai:mj:pan:right:${jobId}` },
        ],
        [
            {
                text: 'Zoom out',
                callback_data: `ai:mj:outpaint:${jobId}`,
            },
            {
                text: 'Vary Region',
                callback_data: `ai:mj:inpaint:${jobId}`,
            },
        ],
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
            return buildMjSingleActionKeyboard(jobId);
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
