import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BotService } from '@/common/services/bot';
import { UserModelService } from '@/common/models/user';
import { ShkeeperService } from '@/common/services/shkeeper';
import { AntilopayService } from '@/common/services/antilopay';
import { notifyPaidSubscriptionActivations } from '@/common/services/payment/notify-paid-subscription';

@Injectable()
export class PaymentCron implements OnModuleInit {
    constructor(
        private readonly shkeeperService: ShkeeperService,
        private readonly antilopayService: AntilopayService,
        private readonly botService: BotService,
        private readonly userModelService: UserModelService,
        @InjectPinoLogger(PaymentCron.name)
        private readonly logger: PinoLogger,
    ) {}

    onModuleInit() {
        if (this.shkeeperService.isConfigured()) {
            this.logger.info('SHKeeper polling cron started');
        }
        if (this.antilopayService.isConfigured()) {
            this.logger.info('Antilopay polling cron started');
        }
    }

    @Cron('*/30 * * * * *', {
        name: 'poll-shkeeper-payments',
        waitForCompletion: true,
    })
    public async pollCryptoPayments() {
        if (!this.shkeeperService.isConfigured()) {
            return;
        }

        try {
            const results = await this.shkeeperService.pollPendingPayments();
            await notifyPaidSubscriptionActivations(
                this.botService,
                this.userModelService,
                results,
            );
        } catch (err) {
            this.logger.error(
                `SHKeeper polling failed: ${err instanceof Error ? err.message : String(err)}`,
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
