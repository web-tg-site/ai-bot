import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';

import { BotService } from '@services/bot';
import { PrismaModule } from '@/common/services/prisma';
import { pinoFactoryConfig } from './core';
import { UserModule } from '@/common/models/user';
import { SubscriptionCron } from '@/common/crons/subscription';
import { AiModule } from '@/common/services/ai';
import { RedisService } from '@/common/services/redis';
import {
    ApayVerificationController,
    HealthController,
} from '@/common/controllers';

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
        AiModule,
    ],
    controllers: [HealthController, ApayVerificationController],
    providers: [RedisService, BotService, SubscriptionCron],
})
export class AppModule {}
