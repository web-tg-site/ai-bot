import { UserModelService } from '@/common/models/user';
import {
    AiJobService,
    AiService,
    TokenBillingService,
} from '@/common/services/ai';

export type BotHandlerDeps = {
    userModelService: UserModelService;
    aiService: AiService;
    tokenBillingService: TokenBillingService;
    aiJobService: AiJobService;
};
