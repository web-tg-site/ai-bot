import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BotService } from '@/common/services/bot';
import { UserModelService } from '@/common/models/user';
import { CryptoPayService } from '@/common/services/crypto-pay';
import { getI18nForUser } from '@/common/services/bot/i18n';
import { formatDate } from '@/common/services/bot/i18n/format';

@Injectable()
export class PaymentCron implements OnModuleInit {
    constructor(
        private readonly cryptoPayService: CryptoPayService,
        private readonly botService: BotService,
        private readonly userModelService: UserModelService,
        @InjectPinoLogger(PaymentCron.name)
        private readonly logger: PinoLogger,
    ) {}

    onModuleInit() {
        if (this.cryptoPayService.isConfigured()) {
            this.logger.info('Payment polling cron started');
        }
    }

    @Cron('*/30 * * * * *', { name: 'poll-crypto-payments' })
    public async pollCryptoPayments() {
        if (!this.cryptoPayService.isConfigured()) {
            return;
        }

        try {
            const results = await this.cryptoPayService.pollPendingPayments();

            for (const result of results) {
                if (result.status !== 'activated') {
                    continue;
                }

                const user = await this.userModelService.getUserByTelegramId(
                    result.telegramId,
                );
                const i18n = getI18nForUser(user);

                await this.botService.sendMessage(
                    result.telegramId,
                    i18n.payment.success(
                        i18n.records.subTypeToText[result.subscribeType],
                        i18n.records.subPlanToPeriod[result.subscribePlan],
                        formatDate(result.subscriptionEndsAt, i18n.lang),
                    ),
                    { parse_mode: 'HTML' },
                );
            }
        } catch (err) {
            this.logger.error(
                `Payment polling failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
}
