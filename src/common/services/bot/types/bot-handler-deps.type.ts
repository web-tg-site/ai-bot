import { GptConversationModelService } from '@/common/models/gpt-conversation';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import { UserModelService } from '@/common/models/user';
import {
    AiJobService,
    AiService,
    ImageCapabilitiesService,
    VideoCapabilitiesService,
    TokenBillingService,
} from '@/common/services/ai';
import { CryptoPayService } from '@/common/services/crypto-pay';

export type BotHandlerDeps = {
    userModelService: UserModelService;
    gptConversationModelService: GptConversationModelService;
    userAiToolSettingsModelService: UserAiToolSettingsModelService;
    imageCapabilitiesService: ImageCapabilitiesService;
    videoCapabilitiesService: VideoCapabilitiesService;
    aiService: AiService;
    tokenBillingService: TokenBillingService;
    aiJobService: AiJobService;
    cryptoPayService: CryptoPayService;
};
