import { AiToolId } from './ai-tool-id.enum';
import { AiChatMessage } from './ai-generation-result.type';

export type AiSessionStep =
    | 'idle'
    | 'awaiting_input'
    | 'awaiting_voice_sample'
    | 'awaiting_voice_text';

export type StoredVoiceSample = {
    data: string;
    mimeType: string;
    fileName?: string;
};

export type BotSession = {
    ai?: {
        activeToolId?: AiToolId;
        step: AiSessionStep;
        gptMode?: 'search';
        chatHistory?: AiChatMessage[];
        voiceSample?: StoredVoiceSample;
        customVoiceId?: string;
    };
};
