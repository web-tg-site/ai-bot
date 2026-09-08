import {
    DEFAULT_HEYGEN_BACKGROUND_COLOR,
    DEFAULT_HEYGEN_BACKGROUND_MODE,
    DEFAULT_HEYGEN_ENGINE,
    DEFAULT_HEYGEN_EXPRESSIVENESS,
    DEFAULT_HEYGEN_VOICE_PITCH,
    DEFAULT_HEYGEN_VOICE_SPEED,
    type HeyGenBackgroundMode,
    type HeyGenEngine,
    type HeyGenExpressiveness,
} from '@/common/config/heygen.config';
import type { AiJobStatusResult } from '../types';

export type HeyGenVideoJobKind = 'avatar' | 'image';

export type HeyGenSharedVideoInput = {
    heygenEngine?: HeyGenEngine;
    heygenCaptions?: boolean;
    heygenBackgroundMode?: HeyGenBackgroundMode;
    heygenBackgroundColor?: string;
    heygenExpressiveness?: HeyGenExpressiveness;
    heygenMotionPrompt?: string;
    heygenVoiceSpeed?: number;
    heygenVoicePitch?: number;
};

export const HEYGEN_CAPTIONED_VIDEO_WAIT_MS = 90_000;

export function heygenSupportsEngine(kind: HeyGenVideoJobKind): boolean {
    return kind === 'avatar';
}

export function heygenSupportsExpressiveness(
    kind: HeyGenVideoJobKind,
    engine: HeyGenEngine,
): boolean {
    if (kind === 'image') return true;
    return engine === 'avatar_iv';
}

export function heygenSupportsMotionPrompt(
    kind: HeyGenVideoJobKind,
    engine: HeyGenEngine,
): boolean {
    if (engine === 'avatar_iii') return false;
    if (kind === 'image') return true;
    return engine === 'avatar_v';
}

export function buildHeyGenSharedVideoOptions(
    input: HeyGenSharedVideoInput,
    flags: {
        kind: HeyGenVideoJobKind;
        hasAudioAsset: boolean;
    },
): Record<string, unknown> {
    const engine = input.heygenEngine ?? DEFAULT_HEYGEN_ENGINE;
    const options: Record<string, unknown> = {};

    if (heygenSupportsEngine(flags.kind)) {
        options.engine = { type: engine };
    }

    if (input.heygenCaptions) {
        options.caption = { file_format: 'srt', style: 'default' };
    }

    const backgroundMode =
        input.heygenBackgroundMode ?? DEFAULT_HEYGEN_BACKGROUND_MODE;
    if (backgroundMode === 'remove') {
        options.remove_background = true;
    } else if (backgroundMode === 'color') {
        options.background = {
            type: 'color',
            value:
                input.heygenBackgroundColor ?? DEFAULT_HEYGEN_BACKGROUND_COLOR,
        };
    }

    if (!flags.hasAudioAsset) {
        const speed = input.heygenVoiceSpeed ?? DEFAULT_HEYGEN_VOICE_SPEED;
        const pitch = input.heygenVoicePitch ?? DEFAULT_HEYGEN_VOICE_PITCH;
        if (speed !== DEFAULT_HEYGEN_VOICE_SPEED || pitch !== 0) {
            options.voice_settings = {
                speed: clamp(speed, 0.5, 1.5),
                pitch: clamp(pitch, -50, 50),
            };
        }
    }

    const motionPrompt = input.heygenMotionPrompt?.trim();
    if (motionPrompt && heygenSupportsMotionPrompt(flags.kind, engine)) {
        options.motion_prompt = motionPrompt;
    }

    const expressiveness =
        input.heygenExpressiveness ?? DEFAULT_HEYGEN_EXPRESSIVENESS;
    if (
        expressiveness !== DEFAULT_HEYGEN_EXPRESSIVENESS &&
        heygenSupportsExpressiveness(flags.kind, engine)
    ) {
        options.expressiveness = expressiveness;
    }

    return options;
}

export type HeyGenVideoStatusData = {
    status: string;
    video_url?: string;
    captioned_video_url?: string;
    subtitle_url?: string;
    failure_message?: string;
};

export type HeyGenStatusResolution = {
    status: AiJobStatusResult['status'];
    resultUrl?: string;
    errorMessage?: string;
    waitingForCaptioned?: boolean;
};

export function resolveHeyGenJobStatus(
    data: HeyGenVideoStatusData,
    options: {
        firstCompletedAt?: number;
        now?: number;
        waitMs?: number;
    } = {},
): HeyGenStatusResolution {
    const mapped = mapHeyGenStatus(data.status);

    if (mapped === 'failed') {
        return {
            status: 'failed',
            errorMessage:
                data.failure_message ??
                'Не удалось завершить генерацию — сбой на стороне провайдера.',
        };
    }

    if (mapped !== 'completed') {
        return { status: mapped };
    }

    const captioned = data.captioned_video_url?.trim() || undefined;
    const video = data.video_url?.trim() || undefined;
    const subtitle = data.subtitle_url?.trim() || undefined;

    if (captioned) {
        return { status: 'completed', resultUrl: captioned };
    }

    if (subtitle) {
        const now = options.now ?? Date.now();
        const first = options.firstCompletedAt;
        const waitMs = options.waitMs ?? HEYGEN_CAPTIONED_VIDEO_WAIT_MS;
        if (first == null || now - first < waitMs) {
            return { status: 'processing', waitingForCaptioned: true };
        }
        if (video) {
            return { status: 'completed', resultUrl: video };
        }
        return { status: 'processing' };
    }

    if (video) {
        return { status: 'completed', resultUrl: video };
    }

    return { status: 'processing' };
}

export function mapHeyGenStatus(status: string): AiJobStatusResult['status'] {
    const normalized = status.toLowerCase();
    if (['completed', 'success', 'done'].includes(normalized)) {
        return 'completed';
    }
    if (['failed', 'error'].includes(normalized)) return 'failed';
    if (['processing', 'pending', 'waiting'].includes(normalized)) {
        return 'processing';
    }
    return 'pending';
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
