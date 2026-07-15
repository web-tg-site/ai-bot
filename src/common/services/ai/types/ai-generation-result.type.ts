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
