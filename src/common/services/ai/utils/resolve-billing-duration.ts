import { getToolById } from '@/common/config/ai-tools.registry';
import { HIGGSFIELD_NO_MOTION_ID } from '@/common/config/higgsfield-motions.config';
import { AiToolId } from '../types';

/** Minimal input shape for billing duration — mirrors provider routing. */
export type BillingDurationInput = {
    durationSeconds?: number;
    files?: Array<{ mimeType: string }>;
    higgsfieldMotionId?: string;
    veoMode?: 'create' | 'extend';
    resolution?: string;
    attachmentRoles?: ReadonlyArray<string>;
    sourceGenerationId?: string;
};

function closestDuration(allowed: readonly number[], value: number): number {
    return allowed.reduce((closest, candidate) =>
        Math.abs(candidate - value) < Math.abs(closest - value)
            ? candidate
            : closest,
    );
}

function hasImageFile(files: BillingDurationInput['files']): boolean {
    return (files ?? []).some((file) => file.mimeType.startsWith('image/'));
}

function hasVideoFile(files: BillingDurationInput['files']): boolean {
    return (files ?? []).some((file) => file.mimeType.startsWith('video/'));
}

function imageFileCount(files: BillingDurationInput['files']): number {
    return (files ?? []).filter((file) => file.mimeType.startsWith('image/'))
        .length;
}

function isHiggsfieldDop(input: BillingDurationInput): boolean {
    const motionId = input.higgsfieldMotionId?.trim();
    const hasMotion = Boolean(motionId) && motionId !== HIGGSFIELD_NO_MOTION_ID;
    return hasMotion || hasImageFile(input.files);
}

/**
 * Higgsfield text-to-video only accepts 5 or 10 seconds.
 * DoP (photo / effect) ignores duration — clips are ~5s.
 */
export function resolveHiggsfieldBillingDuration(
    input: BillingDurationInput,
): number {
    if (isHiggsfieldDop(input)) {
        return 5;
    }
    return (input.durationSeconds ?? 5) >= 10 ? 10 : 5;
}

/** Kling Omni (video reference) output is 5 or 10 only. */
export function resolveKlingBillingDuration(
    input: BillingDurationInput,
): number {
    const requested = input.durationSeconds ?? 5;
    if (hasVideoFile(input.files)) {
        return closestDuration([5, 10], requested);
    }
    const clamped = Math.min(15, Math.max(5, Math.round(requested)));
    return closestDuration([5, 10, 15], clamped);
}

/**
 * Veo snaps to 4/6/8, but several modes force exactly 8s
 * (extend, refs, last frame, 1080p/4K) — same rules as GoogleProvider.
 */
export function resolveVeoBillingDuration(input: BillingDurationInput): number {
    const roles = input.attachmentRoles ?? [];
    const needsFixedEight =
        input.veoMode === 'extend' ||
        roles.includes('reference') ||
        roles.includes('end_frame') ||
        input.resolution === '1080p' ||
        input.resolution === '4k' ||
        imageFileCount(input.files) >= 2;

    if (needsFixedEight) {
        return 8;
    }

    return closestDuration([4, 6, 8], input.durationSeconds ?? 4);
}

/**
 * Duration that will actually be sent to / enforced by the provider.
 * Use this for token billing so charge matches delivered clip length.
 */
export function resolveBillingDurationSeconds(
    toolId: AiToolId,
    input: BillingDurationInput,
): number {
    const fallback =
        getToolById(toolId)?.defaultDurationSeconds ??
        input.durationSeconds ??
        5;
    const requested = input.durationSeconds ?? fallback;

    switch (toolId) {
        case AiToolId.HIGGSFIELD:
            return resolveHiggsfieldBillingDuration(input);
        case AiToolId.KLING:
            return resolveKlingBillingDuration(input);
        case AiToolId.LUMA_RAY:
            return requested <= 5 ? 5 : 10;
        case AiToolId.VEO:
            return resolveVeoBillingDuration(input);
        case AiToolId.SEEDANCE:
            return Math.min(30, Math.max(4, Math.round(requested)));
        case AiToolId.KLING_MOTION:
        case AiToolId.HEYGEN:
        case AiToolId.TOPAZ:
        default:
            return requested;
    }
}
