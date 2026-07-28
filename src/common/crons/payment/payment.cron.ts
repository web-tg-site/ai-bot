import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BotService } from '@/common/services/bot';
import { UserModelService } from '@/common/models/user';
import { CryptoPayService } from '@/common/services/crypto-pay';
import { AntilopayService } from '@/common/services/antilopay';
import { notifyPaidSubscriptionActivations } from '@/common/services/payment/notify-paid-subscription';

@Injectable()
export class PaymentCron implements OnModuleInit {
    constructor(
        private readonly cryptoPayService: CryptoPayService,
        private readonly antilopayService: AntilopayService,
        private readonly botService: BotService,
        private readonly userModelService: UserModelService,
        @InjectPinoLogger(PaymentCron.name)
        private readonly logger: PinoLogger,
    ) {}

    onModuleInit() {
        if (this.cryptoPayService.isConfigured()) {
            this.logger.info('Crypto Pay polling cron started');
        }
        if (this.antilopayService.isConfigured()) {
            this.logger.info('Antilopay polling cron started');
        }
    }

    @Cron('*/30 * * * * *', { name: 'poll-crypto-payments' })
    public async pollCryptoPayments() {
        if (!this.cryptoPayService.isConfigured()) {
            return;
        }

        try {
            const results = await this.cryptoPayService.pollPendingPayments();
            await notifyPaidSubscriptionActivations(
                this.botService,
                this.userModelService,
                results,
            );
        } catch (err) {
            this.logger.error(
                `Crypto Pay polling failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    @Cron('*/30 * * * * *', { name: 'poll-antilopay-payments' })
    public async pollAntilopayPayments() {
        if (!this.antilopayService.isConfigured()) {
            return;
        }

        try {
            const results = await this.antilopayService.pollPendingPayments();
            await notifyPaidSubscriptionActivations(
                this.botService,
                this.userModelService,
                results,
            );
        } catch (err) {
            this.logger.error(
                `Antilopay polling failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
}
