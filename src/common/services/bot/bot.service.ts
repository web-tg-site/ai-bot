import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { ALLOWED_UPDATES } from './consts';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
    private readonly bot: Telegraf;

    constructor(
        @InjectPinoLogger(BotService.name)
        private readonly logger: PinoLogger,
        private readonly configService: ConfigService,
    ) {
        const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is not set');
        }

        this.bot = new Telegraf(token);
        this.bot.catch((err, ctx) => {
            this.logger.error(
                `Telegraf error: ${err instanceof Error ? err.message : String(err)} update=${ctx?.updateType}`,
            );
        });
    }

    async onModuleInit() {
        const me = await this.bot.telegram.getMe();
        this.logger.info({ username: me.username }, 'Bot starting');

        void this.bot
            .launch({
                dropPendingUpdates: true,
                allowedUpdates: [...ALLOWED_UPDATES],
            })
            .catch((err) => {
                this.logger.error(
                    `Bot launch failed: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                );
            });
    }

    onModuleDestroy() {
        this.bot.stop();
        this.logger.info('Bot stopped');
    }
}
