export type AiGenerationResultType =
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document';

export type AiGenerationResult = {
    type: AiGenerationResultType;
    text?: string;
    url?: string;
    buffer?: Buffer;
    mimeType?: string;
    voiceBuffer?: Buffer;
    voiceMimeType?: string;
    actualTokenCost?: number;
    additionalUrls?: string[];
};

export type GptReplyMode = 'text' | 'audio' | 'both';

export type AiGenerationInput = {
    prompt?: string;
    files?: AiFileInput[];
    durationSeconds?: number;
    gptWebSearch?: boolean;
    gptReplyMode?: GptReplyMode;
    chatHistory?: AiChatMessage[];
    customVoiceId?: string;
    elevenLabsVoiceId?: string;
    localeTag?: 'ru-RU' | 'en-US';
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    topazScale?: number;
    videoStyleId?: string;
    videoStylePassthrough?: Record<string, string | number | boolean>;
    higgsfieldMotionId?: string;
    higgsfieldMotionStrength?: number;
    heygenVoiceId?: string;
    heygenAvatarId?: string;
    heygenEngine?: 'avatar_iii' | 'avatar_iv' | 'avatar_v';
    heygenCaptions?: boolean;
    heygenBackgroundMode?: 'default' | 'remove' | 'color';
    heygenBackgroundColor?: string;
    heygenExpressiveness?: 'low' | 'medium' | 'high';
    heygenMotionPrompt?: string;
    heygenVoiceSpeed?: number;
    heygenVoicePitch?: number;
    sunoGenreId?: string;
    sunoMoodId?: string;
    sunoInstrumental?: boolean;
    sunoLyrics?: string;
    outpaintWidth?: number;
    outpaintHeight?: number;
    outpaintOffsetX?: number;
    outpaintOffsetY?: number;
    fluxVideoMode?: 't2v' | 'i2v' | 'v2v' | 'draft_enhance';
    attachmentRoles?: (
        | 'source'
        | 'mask'
        | 'person'
        | 'garment'
        | 'start_frame'
        | 'end_frame'
    )[];
    lumaStyle?: 'auto' | 'manga';
    lumaWebSearch?: boolean;
    lumaOutputFormat?: 'png' | 'jpeg';
    sourceGenerationId?: string;
};

export type AiFileInput = {
    buffer: Buffer;
    mimeType: string;
    fileName?: string;
};

export type AiChatMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
    files?: AiFileInput[];
};

export type AiJobCreateResult = {
    providerJobId: string;
    estimatedTokenCost: number;
};

export type AiJobStatusResult = {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: AiGenerationResult;
    errorMessage?: string;
};
