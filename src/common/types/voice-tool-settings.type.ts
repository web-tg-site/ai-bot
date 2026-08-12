export type VoiceToolSettings = {
    elevenLabsVoiceId?: string;
    sendAsFile?: boolean;
    durationSeconds?: number;
    sunoGenreId?: string;
    sunoMoodId?: string;
    sunoInstrumental?: boolean;
    sunoLyrics?: string;
};

export const DEFAULT_VOICE_TOOL_SETTINGS: VoiceToolSettings = {};
