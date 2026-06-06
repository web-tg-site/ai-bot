import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { LoggerModule } from 'nestjs-pino';

import { BotService } from '@services/bot';
import { pinoFactoryConfig } from './core';

@Module({
    imports: [
        ConfigModule.forRoot(),
        LoggerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) =>
                pinoFactoryConfig(configService),
        }),
        HttpModule,
    ],
    controllers: [],
    providers: [BotService],
})
export class AppModule {}
