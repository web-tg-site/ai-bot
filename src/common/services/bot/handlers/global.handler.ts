import { UserModelService } from '@/common/models/user';
import {
    AiJobService,
    AiService,
    TokenBillingService,
} from '@/common/services/ai';
import { Telegraf } from 'telegraf';
import { registerStartHandler } from './start.handler';
import { registerTestSubHandler } from './test-sub.handler';
import { registerAiHandler } from './ai.handler';
import { registerSupportHandler } from './support.handler';
import { registerSubHandler } from './sub.handler';
import { registerSettingsHandler } from './settings.handler';

export type BotHandlerDeps = {
    userModelService: UserModelService;
    aiService: AiService;
    tokenBillingService: TokenBillingService;
    aiJobService: AiJobService;
};

export const registerGlobalHandler = (bot: Telegraf, deps: BotHandlerDeps) => {
    registerStartHandler(bot, deps.userModelService);
    registerTestSubHandler(bot, deps.userModelService);
    registerAiHandler(bot, deps);
    registerSupportHandler(bot, deps.userModelService);
    registerSubHandler(bot, deps.userModelService);
    registerSettingsHandler(bot, deps.userModelService);
};
