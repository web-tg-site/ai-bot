import { Telegraf } from 'telegraf';
import { registerStartHandler } from './start.handler';
import { registerTestSubHandler } from './test-sub.handler';
import { registerAiHandler } from './ai.handler';
import { registerAiToolHandlers } from './ai-tool.handler';
import { registerSupportHandler } from './support.handler';
import { registerSubHandler } from './sub.handler';
import { registerSettingsHandler } from './settings.handler';
import { registerGptChatHandlers } from './gpt-chat.handler';

import { BotHandlerDeps } from '../types/bot-handler-deps.type';

export type { BotHandlerDeps };

export const registerGlobalHandler = (bot: Telegraf, deps: BotHandlerDeps) => {
    registerStartHandler(bot, deps.userModelService);
    registerTestSubHandler(bot, deps.userModelService);
    registerAiHandler(bot, deps);
    registerSupportHandler(bot, deps.userModelService);
    registerSubHandler(bot, deps);
    registerAiToolHandlers(bot, deps);
    registerSettingsHandler(bot, deps.userModelService);
    registerGptChatHandlers(bot, deps);
};
