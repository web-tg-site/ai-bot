import {
    Body,
    Controller,
    Get,
    HttpException,
    HttpStatus,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { CurrentUser, TelegramJwtGuard } from '@/common/auth';
import type { CurrentUserPayload } from '@/common/auth';
import { UserModelService } from '@/common/models/user';
import { PrismaService } from '@/common/services/prisma';
import { CryptoPayService } from '@/common/services/crypto-pay';
import { AntilopayService } from '@/common/services/antilopay';
import { SUB_PLAN_TO_COST } from '@/common/services/bot/records';
import { getI18nForUser } from '@/common/services/bot/i18n';
import { toUserFacingError } from '@/common/services/bot/errors/bot-error.mapper';
import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';

const PAID_TYPES = new Set<SubscribeType>([
    SubscribeType.LITE,
    SubscribeType.PRO,
    SubscribeType.BUSINESS,
]);

class CreatePaymentDto {
    @IsEnum(SubscribeType)
    subscribeType!: SubscribeType;

    @IsEnum(SubscribePlan)
    subscribePlan!: SubscribePlan;

    @IsOptional()
    @IsEmail()
    email?: string;
}

@Controller('api/payments')
@UseGuards(TelegramJwtGuard)
export class PaymentsController {
    constructor(
        private readonly userModelService: UserModelService,
        private readonly prismaService: PrismaService,
        private readonly cryptoPayService: CryptoPayService,
        private readonly antilopayService: AntilopayService,
    ) {}

    @Post('crypto-pay')
    async createCryptoPay(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: CreatePaymentDto,
    ) {
        this.assertPaidTariff(body.subscribeType, body.subscribePlan);

        const user = await this.userModelService.getUserByTelegramId(
            current.telegramId,
        );
        if (!user) {
            throw new HttpException(
                { error: 'Пользователь не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        if (!this.cryptoPayService.isConfigured()) {
            throw new HttpException(
                { error: 'Оплата криптовалютой временно недоступна' },
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }

        const i18n = getI18nForUser(user);
        const amountUsd =
            SUB_PLAN_TO_COST[body.subscribePlan][body.subscribeType].usdt;

        try {
            const invoice =
                await this.cryptoPayService.createSubscriptionInvoice({
                    userId: user.id,
                    subscribeType: body.subscribeType,
                    subscribePlan: body.subscribePlan,
                    amountUsd,
                    periodLabel:
                        i18n.records.subPlanToPeriod[body.subscribePlan],
                    tariffLabel: i18n.records.subTypeToText[body.subscribeType],
                });

            return {
                payUrl: invoice.botInvoiceUrl,
                orderId: invoice.orderId,
                amountUsd: invoice.amountUsd,
            };
        } catch (error) {
            throw new HttpException(
                {
                    error: toUserFacingError(
                        error instanceof Error
                            ? error.message
                            : 'Failed to create invoice',
                    ),
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    @Post('antilopay')
    async createAntilopay(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: CreatePaymentDto,
    ) {
        this.assertPaidTariff(body.subscribeType, body.subscribePlan);

        const user = await this.userModelService.getUserByTelegramId(
            current.telegramId,
        );
        if (!user) {
            throw new HttpException(
                { error: 'Пользователь не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        if (!this.antilopayService.isConfigured()) {
            throw new HttpException(
                { error: 'Оплата картой временно недоступна' },
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }

        const email = body.email?.trim() || user.email;
        if (!email) {
            throw new HttpException(
                { error: 'Укажите email для оплаты' },
                HttpStatus.BAD_REQUEST,
            );
        }

        if (body.email && body.email !== user.email) {
            await this.userModelService.updateUserByTelegramId(
                current.telegramId,
                { email },
            );
        }

        const amountRub =
            SUB_PLAN_TO_COST[body.subscribePlan][body.subscribeType].rub;

        try {
            const session = await this.antilopayService.createCheckoutSession({
                userId: user.id,
                email,
                subscribeType: body.subscribeType,
                subscribePlan: body.subscribePlan,
                amountRub,
            });

            return {
                checkoutUrl: session.checkoutUrl,
                orderId: session.orderId,
                amountRub: session.amountRub,
            };
        } catch (error) {
            throw new HttpException(
                {
                    error: toUserFacingError(
                        error instanceof Error
                            ? error.message
                            : 'Failed to create checkout',
                    ),
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    @Get(':orderId')
    async getPayment(
        @CurrentUser() current: CurrentUserPayload,
        @Param('orderId') orderId: string,
    ) {
        const payment = await this.prismaService.payment.findFirst({
            where: {
                orderId,
                userId: current.id,
            },
            select: {
                orderId: true,
                status: true,
                provider: true,
                subscribeType: true,
                subscribePlan: true,
                amountUsd: true,
                amountRub: true,
                createdAt: true,
                paidAt: true,
            },
        });

        if (!payment) {
            throw new HttpException(
                { error: 'Платёж не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        return payment;
    }

    private assertPaidTariff(type: SubscribeType, plan: SubscribePlan) {
        if (!PAID_TYPES.has(type) || !(plan in SUB_PLAN_TO_COST)) {
            throw new HttpException(
                { error: 'Неверный тариф' },
                HttpStatus.BAD_REQUEST,
            );
        }
    }
}
