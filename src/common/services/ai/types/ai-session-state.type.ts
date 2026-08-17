import { AiToolId, AiToolCategory } from './ai-tool-id.enum';
import { GptReplyMode } from './ai-generation-result.type';
import { ImageToolSettings } from '@/common/types/image-tool-settings.type';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';

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
    pendingTechSupport?: boolean;
    pendingRubPayment?: {
        subscribeType: SubscribeType;
        subscribePlan: SubscribePlan;
    };
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
            | 'quality'
            | 'flux_mode';
        videoKeyboardMode?:
            | 'main'
            | 'settings'
            | 'aspect'
            | 'resolution'
            | 'quality'
            | 'duration'
            | 'style'
            | 'effect'
            | 'heygen_voice'
            | 'heygen_avatar'
            | 'heygen_engine'
            | 'heygen_background'
            | 'heygen_expressiveness'
            | 'heygen_speed'
            | 'heygen_pitch';
        voiceKeyboardMode?:
            | 'main'
            | 'settings'
            | 'preview'
            | 'duration'
            | 'genre'
            | 'mood'
            | 'lyrics';
        awaitingSunoLyrics?: boolean;
        pendingElevenLabsVoiceId?: string;
        accessibleElevenLabsVoices?: Array<{
            id: string;
            labelRu: string;
            labelEn: string;
            gender?: 'Женский' | 'Мужской';
            useCase?:
                | 'social_media'
                | 'narrative_story'
                | 'conversational'
                | 'entertainment_tv'
                | 'characters_animation'
                | 'informative_educational'
                | 'advertisement';
            previewUrl?: string | null;
        }>;
        accessibleHiggsfieldMotions?: Array<{
            id: string;
            name: string;
        }>;
        accessibleHeyGenVoices?: Array<{
            id: string;
            name: string;
            language: string | null;
            gender: string | null;
            previewUrl: string | null;
        }>;
        accessibleHeyGenAvatars?: Array<{
            id: string;
            name: string;
            previewImageUrl: string | null;
            previewVideoUrl: string | null;
            gender: string | null;
            defaultVoiceId: string | null;
            supportedEngines: Array<'avatar_iii' | 'avatar_iv' | 'avatar_v'>;
        }>;
        heygenVoicePage?: number;
        heygenAvatarPage?: number;
    };
};
