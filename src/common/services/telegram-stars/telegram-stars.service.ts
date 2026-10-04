import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Telegram } from 'telegraf';
import { PrismaService } from '@/common/services/prisma';
import { UserModelService } from '@/common/models/user';
import {
    PaymentProvider,
    PaymentStatus,
    SubscribePlan,
    SubscribeType,
} from '@/generated/prisma/enums';
import { BOT_NAME } from '@/common/config';
import { ProcessInvoicePaidResult } from '@/common/services/crypto-pay';

export type CreateStarsInvoiceParams = {
    userId: string;
    subscribeType: SubscribeType;
    subscribePlan: SubscribePlan;
    amountStars: number;
    periodLabel: string;
    tariffLabel: string;
};

export type StarsInvoiceParams = {
    orderId: string;
    amountStars: number;
    title: string;
    description: string;
    prices: Array<{ label: string; amount: number }>;
};

export type CreateStarsInvoiceLinkResult = StarsInvoiceParams & {
    invoiceUrl: string;
};

@Injectable()
export class TelegramStarsService {
    private readonly telegram: Telegram | null;

    constructor(
        @InjectPinoLogger(TelegramStarsService.name)
        private readonly logger: PinoLogger,
        private readonly configService: ConfigService,
        private readonly prismaService: PrismaService,
        private readonly userModelService: UserModelService,
    ) {
        const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
        this.telegram = token ? new Telegram(token) : null;
    }

    public isConfigured(): boolean {
        return Boolean(this.telegram);
    }

    public buildInvoiceParams(
        params: CreateStarsInvoiceParams & { orderId: string },
    ): StarsInvoiceParams {
        const title = `${BOT_NAME} — ${params.tariffLabel}`;
        const description = `${params.tariffLabel} / ${params.periodLabel}`;
        const label = `${params.tariffLabel} (${params.periodLabel})`;

        return {
            orderId: params.orderId,
            amountStars: params.amountStars,
            title,
            description,
            prices: [{ label, amount: params.amountStars }],
        };
    }

    public async createPendingPayment(
        params: CreateStarsInvoiceParams,
    ): Promise<StarsInvoiceParams> {
        const orderId = randomUUID();

        await this.prismaService.payment.create({
            data: {
                userId: params.userId,
                provider: PaymentProvider.TELEGRAM_STARS,
                orderId,
                subscribeType: params.subscribeType,
                subscribePlan: params.subscribePlan,
                amountStars: params.amountStars,
            },
        });

        return this.buildInvoiceParams({ ...params, orderId });
    }

    public async createSubscriptionInvoiceLink(
        params: CreateStarsInvoiceParams,
    ): Promise<CreateStarsInvoiceLinkResult> {
        if (!this.telegram) {
            throw new Error('TELEGRAM_BOT_TOKEN is not set');
        }

        const invoice = await this.createPendingPayment(params);

        try {
            const invoiceUrl = await this.telegram.createInvoiceLink({
                title: invoice.title,
                description: invoice.description,
                payload: invoice.orderId,
                provider_token: '',
                currency: 'XTR',
                prices: invoice.prices,
            });

            return {
                ...invoice,
                invoiceUrl,
            };
        } catch (error) {
            await this.prismaService.payment.updateMany({
                where: {
                    orderId: invoice.orderId,
                    status: PaymentStatus.PENDING,
                },
                data: { status: PaymentStatus.EXPIRED },
            });

            this.logger.error(
                {
                    err: error instanceof Error ? error.message : String(error),
                    orderId: invoice.orderId,
                    userId: params.userId,
                    amountStars: params.amountStars,
                },
                'Telegram Stars createInvoiceLink failed',
            );

            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    public async assertPreCheckout(orderId: string): Promise<{
        ok: boolean;
        errorMessage?: string;
    }> {
        if (!orderId) {
            return { ok: false, errorMessage: 'Invalid payment payload' };
        }

        const payment = await this.prismaService.payment.findUnique({
            where: { orderId },
            select: {
                status: true,
                provider: true,
            },
        });

        if (!payment || payment.provider !== PaymentProvider.TELEGRAM_STARS) {
            return { ok: false, errorMessage: 'Payment not found' };
        }

        if (payment.status === PaymentStatus.PAID) {
            return { ok: false, errorMessage: 'Payment already completed' };
        }

        if (payment.status !== PaymentStatus.PENDING) {
            return { ok: false, errorMessage: 'Payment expired' };
        }

        return { ok: true };
    }

    public async processSuccessfulPayment(
        orderId: string,
        telegramPaymentChargeId: string,
    ): Promise<ProcessInvoicePaidResult> {
        return this.prismaService.$transaction(async (tx) => {
            if (telegramPaymentChargeId) {
                const byCharge = await tx.payment.findUnique({
                    where: { telegramPaymentChargeId },
                    select: { id: true, status: true },
                });

                if (byCharge?.status === PaymentStatus.PAID) {
                    return { status: 'already_paid' as const };
                }
            }

            const payment = await tx.payment.findUnique({
                where: { orderId },
                include: { user: true },
            });

            if (
                !payment ||
                payment.provider !== PaymentProvider.TELEGRAM_STARS
            ) {
                this.logger.warn(
                    { orderId, telegramPaymentChargeId },
                    'Stars payment not found',
                );
                return { status: 'not_found' as const };
            }

            if (payment.status === PaymentStatus.PAID) {
                return { status: 'already_paid' as const };
            }

            const now = new Date();

            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: PaymentStatus.PAID,
                    paidAt: now,
                    telegramPaymentChargeId: telegramPaymentChargeId || null,
                },
            });

            const { subscriptionEndsAt } =
                await this.userModelService.activatePaidSubscriptionInTransaction(
                    tx,
                    payment.userId,
                    payment.subscribeType,
                    payment.subscribePlan,
                );

            return {
                status: 'activated' as const,
                telegramId: payment.user.telegramId,
                subscribeType: payment.subscribeType,
                subscribePlan: payment.subscribePlan,
                subscriptionEndsAt,
            };
        });
    }
}
