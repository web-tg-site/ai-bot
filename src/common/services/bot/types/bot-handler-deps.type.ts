import { GptConversationModelService } from '@/common/models/gpt-conversation';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import { UserModelService } from '@/common/models/user';
import {
    AiJobService,
    AiService,
    ImageCapabilitiesService,
    VideoCapabilitiesService,
    TokenBillingService,
    ElevenLabsVoicePreviewService,
    ModelFailoverService,
} from '@/common/services/ai';
import { ShkeeperService } from '@/common/services/shkeeper';
import { AntilopayService } from '@/common/services/antilopay';
import { TelegramStarsService } from '@/common/services/telegram-stars';
import { RedisService } from '@/common/services/redis';

export type BotHandlerDeps = {
    userModelService: UserModelService;
    gptConversationModelService: GptConversationModelService;
    userAiToolSettingsModelService: UserAiToolSettingsModelService;
    imageCapabilitiesService: ImageCapabilitiesService;
    videoCapabilitiesService: VideoCapabilitiesService;
    aiService: AiService;
    tokenBillingService: TokenBillingService;
    aiJobService: AiJobService;
    modelFailoverService: ModelFailoverService;
    shkeeperService: ShkeeperService;
    miniAppUrl?: string;
    antilopayService: AntilopayService;
    telegramStarsService: TelegramStarsService;
    elevenLabsVoicePreviewService: ElevenLabsVoicePreviewService;
    redisService: RedisService;
};
