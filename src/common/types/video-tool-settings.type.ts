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

export type SoraCharacterSettingsRecord = {
    id: string;
    name: string;
    createdAt: string;
};

export type VideoToolSettings = {
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    durationSeconds?: number;
    styleId?: string;
    higgsfieldMotionId?: string;
    sendAsFile?: boolean;
    heygenVoiceId?: string;
    heygenAvatarId?: string;
    heygenEngine?: HeyGenEngine;
    heygenCaptions?: boolean;
    heygenBackgroundMode?: HeyGenBackgroundMode;
    heygenBackgroundColor?: string;
    heygenExpressiveness?: HeyGenExpressiveness;
    heygenMotionPrompt?: string;
    heygenVoiceSpeed?: number;
    heygenVoicePitch?: number;
    /** Sora characters stored in UserAiToolSettings for toolId sora */
    characters?: SoraCharacterSettingsRecord[];
};

export const DEFAULT_VIDEO_TOOL_SETTINGS: VideoToolSettings = {
    aspectRatio: '16:9',
    resolution: '720p',
    durationSeconds: 5,
    styleId: 'none',
    higgsfieldMotionId: 'none',
    heygenEngine: DEFAULT_HEYGEN_ENGINE,
    heygenCaptions: false,
    heygenBackgroundMode: DEFAULT_HEYGEN_BACKGROUND_MODE,
    heygenBackgroundColor: DEFAULT_HEYGEN_BACKGROUND_COLOR,
    heygenExpressiveness: DEFAULT_HEYGEN_EXPRESSIVENESS,
    heygenVoiceSpeed: DEFAULT_HEYGEN_VOICE_SPEED,
    heygenVoicePitch: DEFAULT_HEYGEN_VOICE_PITCH,
};
