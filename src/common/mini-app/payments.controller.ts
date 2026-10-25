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
import { IsEmail, IsEnum, IsIn, IsOptional } from 'class-validator';
import { CurrentUser, TelegramJwtGuard } from '@/common/auth';
import type { CurrentUserPayload } from '@/common/auth';
import { UserModelService } from '@/common/models/user';
import { PrismaService } from '@/common/services/prisma';
import { ShkeeperService } from '@/common/services/shkeeper';
import type { ShkeeperNetwork } from '@/common/services/shkeeper';
import { AntilopayService } from '@/common/services/antilopay';
import { TelegramStarsService } from '@/common/services/telegram-stars';
import { SUB_PLAN_TO_COST } from '@/common/services/bot/records';
import { getI18nForUser } from '@/common/services/bot/i18n';
import { toUserFacingError } from '@/common/services/bot/errors/bot-error.mapper';
import {
    PaymentProvider,
    PaymentStatus,
    SubscribePlan,
    SubscribeType,
} from '@/generated/prisma/enums';

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

class CreateShkeeperPaymentDto extends CreatePaymentDto {
    @IsIn(['ton', 'trc20', 'bep20'])
    network!: ShkeeperNetwork;
}

@Controller('api/payments')
@UseGuards(TelegramJwtGuard)
export class PaymentsController {
    constructor(
        private readonly userModelService: UserModelService,
        private readonly prismaService: PrismaService,
        private readonly shkeeperService: ShkeeperService,
        private readonly antilopayService: AntilopayService,
        private readonly telegramStarsService: TelegramStarsService,
    ) {}

    @Get('shkeeper/networks')
    getShkeeperNetworks() {
        return this.shkeeperService.getNetworks();
    }

    @Get('shkeeper/pending')
    getPendingShkeeperPayments(@CurrentUser() current: CurrentUserPayload) {
        return this.shkeeperService.getPendingPayments(current.id);
    }

    @Post('shkeeper')
    createShkeeper(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: CreateShkeeperPaymentDto,
    ) {
        this.assertPaidTariff(body.subscribeType, body.subscribePlan);
        return this.shkeeperService.createSubscriptionInvoice({
            userId: current.id,
            subscribeType: body.subscribeType,
            subscribePlan: body.subscribePlan,
            network: body.network,
        });
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

    @Post('stars')
    async createStarsPay(
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

        if (!this.telegramStarsService.isConfigured()) {
            throw new HttpException(
                { error: 'Оплата Stars временно недоступна' },
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }

        const i18n = getI18nForUser(user);
        const amountStars =
            SUB_PLAN_TO_COST[body.subscribePlan][body.subscribeType].stars;

        try {
            const invoice =
                await this.telegramStarsService.createSubscriptionInvoiceLink({
                    userId: user.id,
                    subscribeType: body.subscribeType,
                    subscribePlan: body.subscribePlan,
                    amountStars,
                    periodLabel:
                        i18n.records.subPlanToPeriod[body.subscribePlan],
                    tariffLabel: i18n.records.subTypeToText[body.subscribeType],
                });

            return {
                invoiceUrl: invoice.invoiceUrl,
                orderId: invoice.orderId,
                amountStars: invoice.amountStars,
            };
        } catch (error) {
            throw new HttpException(
                {
                    error: toUserFacingError(
                        error instanceof Error
                            ? error.message
                            : 'Failed to create Stars invoice',
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
        });

        if (!payment) {
            throw new HttpException(
                { error: 'Платёж не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        if (payment.provider === PaymentProvider.SHKEEPER) {
            const instructionsMissing =
                !payment.shkeeperAddress || !payment.shkeeperAmountCrypto;
            // A lost creation response must not hide a later authoritative paid status.
            if (payment.status !== PaymentStatus.PAID || !instructionsMissing) {
                return this.shkeeperService.toCryptoInvoice(payment);
            }
        }
        // Keep the existing generic contract, without leaking provider internals (BigInt IDs).
        return {
            orderId: payment.orderId,
            status: payment.status,
            provider: payment.provider,
            subscribeType: payment.subscribeType,
            subscribePlan: payment.subscribePlan,
            amountUsd: payment.amountUsd,
            amountRub: payment.amountRub,
            amountStars: payment.amountStars,
            createdAt: payment.createdAt,
            paidAt: payment.paidAt,
        };
    }

    private assertPaidTariff(type: SubscribeType, plan: SubscribePlan) {
        if (!PAID_TYPES.has(type) || !Object.hasOwn(SUB_PLAN_TO_COST, plan)) {
            throw new HttpException(
                { error: 'Неверный тариф' },
                HttpStatus.BAD_REQUEST,
            );
        }
    }
}
