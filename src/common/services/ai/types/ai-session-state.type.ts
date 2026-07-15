import { AiToolId, AiToolCategory } from './ai-tool-id.enum';
import { GptReplyMode } from './ai-generation-result.type';
import { ImageToolSettings } from '@/common/types/image-tool-settings.type';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';

export type { GptReplyMode };

export type ToolSettings = ImageToolSettings | VideoToolSettings;

export type AiSessionStep =
    | 'idle'
    | 'awaiting_input'
    | 'awaiting_voice_sample'
    | 'awaiting_voice_text'
    | 'awaiting_image_references'
    | 'awaiting_image_prompt'
    | 'awaiting_video_references'
    | 'awaiting_video_prompt';

export type StoredVoiceSample = {
    data: string;
    mimeType: string;
    fileName?: string;
};

export type StoredReference = StoredVoiceSample & { id: string };

export type BotSession = {
    ai?: {
        activeToolId?: AiToolId;
        step: AiSessionStep;
        activeConversationId?: string;
        gptWebSearch?: boolean;
        gptReplyMode?: GptReplyMode;
        voiceSample?: StoredVoiceSample;
        customVoiceId?: string;
        referenceFiles?: StoredReference[];
        toolSettings?: ToolSettings;
        voiceToolSettings?: VoiceToolSettings;
        activeCategory?: AiToolCategory;
        imageKeyboardMode?:
            | 'main'
            | 'settings'
            | 'aspect'
            | 'resolution'
            | 'quality';
        videoKeyboardMode?:
            | 'main'
            | 'settings'
            | 'aspect'
            | 'resolution'
            | 'quality'
            | 'duration'
            | 'style';
        voiceKeyboardMode?: 'main' | 'settings' | 'preview';
        pendingElevenLabsVoiceId?: string;
        accessibleElevenLabsVoices?: Array<{
            id: string;
            labelRu: string;
            labelEn: string;
        }>;
    };
};
