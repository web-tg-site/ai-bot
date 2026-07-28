import {
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    Post,
    Req,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request } from 'express';
import { AntilopayService } from '@/common/services/antilopay';
import { BotService } from '@/common/services/bot';
import { UserModelService } from '@/common/models/user';
import { notifyPaidSubscriptionActivations } from '@/common/services/payment/notify-paid-subscription';

type AntilopayPaymentCallback = {
    type?: string;
    order_id?: string;
    status?: string;
    original_amount?: number;
    amount?: number;
};

type RawBodyReq = Request & { rawBody?: Buffer };

@Controller()
export class AntilopayController {
    constructor(
        private readonly antilopayService: AntilopayService,
        private readonly botService: BotService,
        private readonly userModelService: UserModelService,
        @InjectPinoLogger(AntilopayController.name)
        private readonly logger: PinoLogger,
    ) {}

    @Post('api/payments/antilopay/callback')
    @HttpCode(200)
    async handleCallback(
        @Req() req: RawBodyReq,
        @Headers('x-apay-callback') signature: string | undefined,
    ): Promise<{ ok: true }> {
        try {
            const rawBody =
                req.rawBody?.toString('utf8') ??
                (typeof req.body === 'string'
                    ? req.body
                    : JSON.stringify(req.body ?? {}));

            if (!this.antilopayService.verifyCallback(rawBody, signature)) {
                this.logger.warn('Antilopay callback: invalid signature');
                return { ok: true };
            }

            const payload = (
                typeof req.body === 'object' && req.body != null
                    ? req.body
                    : JSON.parse(rawBody)
            ) as AntilopayPaymentCallback;

            if (payload.type !== 'payment') {
                return { ok: true };
            }

            if (payload.status === 'SUCCESS' && payload.order_id) {
                const result =
                    await this.antilopayService.processPaymentSuccess(
                        payload.order_id,
                        payload.original_amount ?? payload.amount ?? 0,
                    );

                await notifyPaidSubscriptionActivations(
                    this.botService,
                    this.userModelService,
                    [result],
                );
                return { ok: true };
            }

            if (
                (payload.status === 'FAIL' || payload.status === 'CANCEL') &&
                payload.order_id
            ) {
                await this.antilopayService.markPaymentExpired(
                    payload.order_id,
                );
            }
        } catch (err) {
            this.logger.error(
                `Antilopay callback error: ${err instanceof Error ? err.message : String(err)}`,
            );
        }

        return { ok: true };
    }

    @Get('payments/antilopay/success')
    @Header('Content-Type', 'text/html; charset=utf-8')
    successPage(): string {
        return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Оплата успешна</title></head>
<body style="font-family:sans-serif;text-align:center;padding:2rem">
  <h1>Оплата прошла успешно</h1>
  <p>Можете вернуться в Telegram-бот — подписка активируется автоматически.</p>
</body>
</html>`;
    }

    @Get('payments/antilopay/fail')
    @Header('Content-Type', 'text/html; charset=utf-8')
    failPage(): string {
        return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Оплата не завершена</title></head>
<body style="font-family:sans-serif;text-align:center;padding:2rem">
  <h1>Оплата не завершена</h1>
  <p>Можете вернуться в Telegram-бот и попробовать снова.</p>
</body>
</html>`;
    }
}
