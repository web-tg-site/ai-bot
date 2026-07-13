import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';

import { BotService } from '@services/bot';
import { PrismaModule } from '@/common/services/prisma';
import { pinoFactoryConfig } from './core';
import { UserModule } from '@/common/models/user';
import { GptConversationModule } from '@/common/models/gpt-conversation';
import { UserAiToolSettingsModule } from '@/common/models/user-ai-tool-settings';
import { SubscriptionCron } from '@/common/crons/subscription';
import { AiModule } from '@/common/services/ai';
import { RedisService } from '@/common/services/redis';
import {
    ApayVerificationController,
    HealthController,
} from '@/common/controllers';
import { AuthModule } from '@/common/auth';
import { CryptoPayModule } from '@/common/services/crypto-pay';
import { PaymentCron } from '@/common/crons/payment';

@Module({
    imports: [
        ConfigModule.forRoot(),
        LoggerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) =>
                pinoFactoryConfig(configService),
        }),
        ScheduleModule.forRoot(),
        HttpModule,
        PrismaModule,
        UserModule,
        GptConversationModule,
        UserAiToolSettingsModule,
        AiModule,
        CryptoPayModule,
        AuthModule,
    ],
    controllers: [HealthController, ApayVerificationController],
    providers: [RedisService, BotService, SubscriptionCron, PaymentCron],
})
export class AppModule {}
