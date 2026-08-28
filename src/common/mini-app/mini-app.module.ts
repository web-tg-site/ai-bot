import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@/common/auth';
import { UserModule } from '@/common/models/user';
import { GptConversationModule } from '@/common/models/gpt-conversation';
import { UserAiToolSettingsModule } from '@/common/models/user-ai-tool-settings';
import { PrismaModule } from '@/common/services/prisma';
import { AiModule } from '@/common/services/ai';
import { CryptoPayModule } from '@/common/services/crypto-pay';
import { AntilopayModule } from '@/common/services/antilopay';
import { MeController } from './me.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { PaymentsController } from './payments.controller';
import { AiController } from './ai.controller';
import { ChatsController } from './chats.controller';
import { SupportController } from './support.controller';
import { GenerationFacade } from './generation.facade';

@Module({
    imports: [
        ConfigModule,
        AuthModule,
        UserModule,
        GptConversationModule,
        UserAiToolSettingsModule,
        PrismaModule,
        AiModule,
        CryptoPayModule,
        AntilopayModule,
    ],
    controllers: [
        MeController,
        SubscriptionsController,
        PaymentsController,
        AiController,
        ChatsController,
        SupportController,
    ],
    providers: [GenerationFacade],
    exports: [GenerationFacade],
})
export class MiniAppModule {}
