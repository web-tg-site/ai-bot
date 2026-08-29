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
    images?: Array<{ buffer: Buffer; mimeType: string }>;
    actualTokenCost?: number;
    additionalUrls?: string[];
    /** Apiframe multi-output (MJ grid / Suno tracks). */
    resultJson?: import('@/common/config/apiframe.config').ApiframeResultJson;
    /** Gemini Interactions API id for Nano Banana multi-turn edits. */
    googleInteractionId?: string;
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
    sunoTitle?: string;
    sunoModelVersion?: string;
    sunoNegativeTags?: string;
    sunoVocalGender?: 'm' | 'f';
    sunoAutoLyrics?: boolean;
    sunoStyle?: string;
    sunoStyleWeight?: number;
    sunoWeirdnessConstraint?: number;
    sunoAudioWeight?: number;
    /** Apiframe follow-up action (MJ / Suno). */
    apiframeAction?: import('@/common/config/apiframe.config').ApiframeAction;
    /** Apiframe parent job UUID (providerJobId of parent). */
    parentProviderJobId?: string;
    /** Internal AiGenerationJob id of parent (for mini-app / bot). */
    parentJobId?: string;
    actionIndex?: 1 | 2 | 3 | 4;
    actionDirection?: 'up' | 'down' | 'left' | 'right';
    continueAt?: number;
    trackId?: string;
    outpaintWidth?: number;
    outpaintHeight?: number;
    outpaintOffsetX?: number;
    outpaintOffsetY?: number;
    fluxVideoMode?: 't2v' | 'i2v' | 'v2v' | 'draft_enhance';
    fluxImageMode?: 'generate' | 'deblur' | 'erase' | 'try_on' | 'outpaint';
    attachmentRoles?: (
        | 'source'
        | 'mask'
        | 'person'
        | 'garment'
        | 'start_frame'
        | 'end_frame'
        | 'reference'
    )[];
    lumaStyle?: 'auto' | 'manga';
    lumaWebSearch?: boolean;
    lumaOutputFormat?: 'png' | 'jpeg';
    sourceGenerationId?: string;
    soraVideoMode?: 'create' | 'extend' | 'edit';
    soraCharacterIds?: string[];
    soraCharacterName?: string;
    /** Kling / Veo negative prompt. */
    negativePrompt?: string;
    /** Kling native audio generation (sound on/off). */
    klingSound?: boolean;
    /** Kling Motion: character orientation from image or reference video. */
    klingCharacterOrientation?: 'image' | 'video';
    /** Kling Motion: keep audio from motion reference video. */
    klingKeepOriginalSound?: boolean;
    /** Nano Banana thinking depth (Gemini Interactions). */
    nanoThinkingLevel?: 'minimal' | 'high';
    /** Nano Banana Google Search grounding. */
    nanoGoogleSearch?: boolean;
    /** Previous Gemini interaction id for multi-turn Nano Banana edits. */
    googlePreviousInteractionId?: string;
    /** Veo: create new clip or extend a previous Veo video. */
    veoMode?: 'create' | 'extend';
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
