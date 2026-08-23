export type VoiceToolSettings = {
    elevenLabsVoiceId?: string;
    sendAsFile?: boolean;
    durationSeconds?: number;
    sunoGenreId?: string;
    sunoMoodId?: string;
    sunoInstrumental?: boolean;
    sunoLyrics?: string;
    sunoTitle?: string;
    sunoModelVersion?: string;
    sunoNegativeTags?: string;
    sunoVocalGender?: 'm' | 'f';
    sunoAutoLyrics?: boolean;
};

export const DEFAULT_VOICE_TOOL_SETTINGS: VoiceToolSettings = {};
