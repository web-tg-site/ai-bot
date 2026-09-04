export type ApiframeAction =
    | 'upsample'
    | 'variation'
    | 'inpaint'
    | 'outpaint'
    | 'pan'
    | 'extend'
    | 'cover'
    | 'add_vocals'
    | 'stems';

export type ApiframeResultKind =
    | 'midjourney_grid'
    | 'midjourney_single'
    | 'suno_tracks'
    | 'suno_stems';

export type ApiframeTrack = {
    id: string;
    audioUrl: string;
    imageUrl?: string | null;
    title?: string | null;
    tags?: string | null;
    duration?: number | null;
};

export type ApiframeResultJson = {
    kind: ApiframeResultKind;
    gridUrl?: string;
    images?: string[];
    tracks?: ApiframeTrack[];
    eligibleActions?: ApiframeAction[];
};

export const APIFRAME_MJ_ACTIONS: readonly ApiframeAction[] = [
    'upsample',
    'variation',
    'inpaint',
    'outpaint',
    'pan',
] as const;

export const APIFRAME_SUNO_ACTIONS: readonly ApiframeAction[] = [
    'extend',
    'cover',
    'add_vocals',
    'stems',
] as const;

/** Token costs mapped from Apiframe credits (~3 tokens per credit). */
export function resolveApiframeActionTokenCost(action: ApiframeAction): number {
    switch (action) {
        case 'upsample':
            return 6;
        case 'variation':
        case 'inpaint':
        case 'outpaint':
        case 'pan':
            return 30;
        case 'extend':
        case 'cover':
        case 'add_vocals':
            return 22;
        case 'stems':
            return 40;
        default:
            return 30;
    }
}

export function resolveApiframeGenerateTokenCost(
    tool: 'midjourney' | 'suno',
): number {
    return tool === 'midjourney' ? 30 : 22;
}

export function eligibleActionsForKind(
    kind: ApiframeResultKind,
): ApiframeAction[] {
    switch (kind) {
        case 'midjourney_grid':
            return ['upsample', 'variation'];
        case 'midjourney_single':
            return ['pan', 'outpaint', 'inpaint'];
        case 'suno_tracks':
            return ['extend', 'cover', 'add_vocals', 'stems'];
        case 'suno_stems':
            return [];
        default:
            return [];
    }
}

export const SUNO_MODEL_VERSIONS = [
    'V4',
    'V4_5',
    'V4_5ALL',
    'V4_5PLUS',
    'V5',
    'V5_5',
] as const;

export type SunoModelVersion = (typeof SUNO_MODEL_VERSIONS)[number];

export const DEFAULT_SUNO_MODEL_VERSION: SunoModelVersion = 'V4_5PLUS';

export function isApiframeAction(value: string): value is ApiframeAction {
    return (
        (APIFRAME_MJ_ACTIONS as readonly string[]).includes(value) ||
        (APIFRAME_SUNO_ACTIONS as readonly string[]).includes(value)
    );
}
