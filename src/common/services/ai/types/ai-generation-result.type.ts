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
    actualTokenCost?: number;
};

export type AiGenerationInput = {
    prompt?: string;
    files?: AiFileInput[];
    durationSeconds?: number;
    gptMode?: 'search';
    chatHistory?: AiChatMessage[];
    customVoiceId?: string;
};

export type AiFileInput = {
    buffer: Buffer;
    mimeType: string;
    fileName?: string;
};

export type AiChatMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
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
