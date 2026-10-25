import {
    BadRequestException,
    Controller,
    Headers,
    HttpCode,
    Post,
    Req,
    UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ShkeeperService } from '@/common/services/shkeeper';
import { isShkeeperOrderId } from '@/common/services/shkeeper/shkeeper.validation';
import { BotService } from '@/common/services/bot';
import { UserModelService } from '@/common/models/user';
import { notifyPaidSubscriptionActivations } from '@/common/services/payment/notify-paid-subscription';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Controller('api/payments/shkeeper')
export class ShkeeperController {
    constructor(
        private readonly shkeeper: ShkeeperService,
        private readonly bot: BotService,
        private readonly users: UserModelService,
        @InjectPinoLogger(ShkeeperController.name)
        private readonly logger: PinoLogger,
    ) {}

    @Post('callback')
    @HttpCode(200)
    async callback(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-shkeeper-timestamp') timestamp: string | undefined,
        @Headers('x-shkeeper-signature') signature: string | undefined,
    ): Promise<{ ok: true }> {
        if (!this.shkeeper.verifyCallback(req.rawBody, timestamp, signature)) {
            throw new UnauthorizedException('Invalid SHKeeper signature');
        }
        const payload = req.body as { external_id?: unknown } | undefined;
        if (!isShkeeperOrderId(payload?.external_id)) {
            throw new BadRequestException('Invalid external_id');
        }
        // No amount, address, currency or paid/status from a callback is trusted.
        const result = await this.shkeeper.reconcilePayment(
            payload.external_id,
        );
        try {
            await notifyPaidSubscriptionActivations(this.bot, this.users, [
                result,
            ]);
        } catch {
            // Activation has committed. A Telegram delivery failure must not request another activation.
            this.logger.warn(
                { orderId: payload.external_id },
                'SHKeeper activation notification failed',
            );
        }
        return { ok: true };
    }
}
