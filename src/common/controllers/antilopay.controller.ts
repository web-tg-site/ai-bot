import {
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    NotFoundException,
    Param,
    Post,
    Req,
    Res,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Request, Response } from 'express';
import { AntilopayService, extractClientIp } from '@/common/services/antilopay';
import { BotService } from '@/common/services/bot';
import { UserModelService } from '@/common/models/user';
import { PrismaService } from '@/common/services/prisma';
import { notifyPaidSubscriptionActivations } from '@/common/services/payment/notify-paid-subscription';
import { getI18nForUser } from '@/common/services/bot/i18n';
import { PaymentProvider, PaymentStatus } from '@/generated/prisma/enums';

type AntilopayPaymentCallback = {
    type?: string;
    order_id?: string;
    status?: string;
    original_amount?: number;
    amount?: number;
};

type RawBodyReq = Request & { rawBody?: Buffer };
type ExpressReq = Request;
type ExpressRes = Response;

@Controller()
export class AntilopayController {
    constructor(
        private readonly antilopayService: AntilopayService,
        private readonly botService: BotService,
        private readonly userModelService: UserModelService,
        private readonly prismaService: PrismaService,
        @InjectPinoLogger(AntilopayController.name)
        private readonly logger: PinoLogger,
    ) {}

    @Get('payments/antilopay/checkout/:orderId')
    async checkout(
        @Param('orderId') orderId: string,
        @Req() req: ExpressReq,
        @Res() res: ExpressRes,
    ): Promise<void> {
        const payment = await this.prismaService.payment.findUnique({
            where: { orderId },
            include: { user: true },
        });

        if (
            !payment ||
            payment.provider !== PaymentProvider.ANTILOPAY ||
            payment.status !== PaymentStatus.PENDING
        ) {
            throw new NotFoundException();
        }

        const clientIp = extractClientIp({
            cfConnectingIp: req.headers['cf-connecting-ip'],
            trueClientIp: req.headers['true-client-ip'],
            forwardedFor: req.headers['x-forwarded-for'],
            ip: req.ip,
            remoteAddress: req.socket.remoteAddress,
        });

        if (!clientIp) {
            this.logger.warn(
                {
                    orderId,
                    cfConnectingIp: req.headers['cf-connecting-ip'],
                    forwardedFor: req.headers['x-forwarded-for'],
                    ip: req.ip,
                },
                'Antilopay checkout: could not resolve public client IP',
            );
            res.status(400).type('html').send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ошибка</title></head>
<body style="font-family:sans-serif;text-align:center;padding:2rem">
  <h1>Не удалось определить IP</h1>
  <p>Откройте ссылку оплаты в обычном браузере (не через VPN/localhost) и попробуйте снова.</p>
</body>
</html>`);
            return;
        }

        const i18n = getI18nForUser(payment.user);

        try {
            const paymentUrl =
                await this.antilopayService.startCheckoutWithClientIp(
                    orderId,
                    clientIp,
                    {
                        periodLabel:
                            i18n.records.subPlanToPeriod[payment.subscribePlan],
                        tariffLabel:
                            i18n.records.subTypeToText[payment.subscribeType],
                    },
                );
            res.redirect(302, paymentUrl);
        } catch (err) {
            this.logger.error(
                {
                    orderId,
                    clientIp,
                    err: err instanceof Error ? err.message : String(err),
                },
                'Antilopay checkout failed',
            );
            res.status(502).type('html').send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ошибка оплаты</title></head>
<body style="font-family:sans-serif;text-align:center;padding:2rem">
  <h1>Не удалось создать платёж</h1>
  <p>Вернитесь в Telegram-бот и попробуйте ещё раз.</p>
</body>
</html>`);
        }
    }

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
