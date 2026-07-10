import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '@/common/services/prisma';
import { UserModelService } from '@/common/models/user';
import {
    PaymentStatus,
    SubscribePlan,
    SubscribeType,
} from '@/generated/prisma/enums';
import { BOT_NAME } from '@/common/config';
import { CRYPTOBOT_API_URL } from '@/common/config/cryptobot.config';

const SEND_BOT_USERNAME = 'send';

type CryptoPayApiResponse<T> = {
    ok: boolean;
    result?: T;
    error?: {
        code: number;
        name: string;
    };
};

type CryptoPayInvoice = {
    invoice_id: number;
    bot_invoice_url: string;
    mini_app_invoice_url?: string;
    web_app_invoice_url?: string;
    pay_url: string;
    status: string;
};

type GetInvoicesResult = CryptoPayInvoice[] | { items: CryptoPayInvoice[] };

export type CreateSubscriptionInvoiceParams = {
    userId: string;
    subscribeType: SubscribeType;
    subscribePlan: SubscribePlan;
    amountUsd: number;
    periodLabel: string;
    tariffLabel: string;
};

export type CreateSubscriptionInvoiceResult = {
    botInvoiceUrl: string;
    amountUsd: number;
};

export type ProcessInvoicePaidResult =
    | { status: 'not_found' }
    | { status: 'already_paid' }
    | {
          status: 'activated';
          telegramId: string;
          subscribeType: SubscribeType;
          subscribePlan: SubscribePlan;
          subscriptionEndsAt: Date;
      };

function resolveSendPaymentUrl(invoice: CryptoPayInvoice): string {
    const raw =
        invoice.mini_app_invoice_url ??
        invoice.bot_invoice_url ??
        invoice.pay_url;

    return raw.replace(
        /https?:\/\/t\.me\/CryptoBot\b/g,
        `https://t.me/${SEND_BOT_USERNAME}`,
    );
}

function extractInvoices(
    result: GetInvoicesResult | undefined,
): CryptoPayInvoice[] {
    if (!result) {
        return [];
    }

    return Array.isArray(result) ? result : (result.items ?? []);
}

@Injectable()
export class CryptoPayService {
    private readonly apiToken: string | undefined;
    private botUsername: string | undefined;

    constructor(
        @InjectPinoLogger(CryptoPayService.name)
        private readonly logger: PinoLogger,
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        private readonly prismaService: PrismaService,
        private readonly userModelService: UserModelService,
    ) {
        this.apiToken = this.configService.get<string>('CRYPTOBOT_KEY');

        if (this.apiToken) {
            this.logger.info('Crypto Pay configured (polling mode)');
        }
    }

    public setBotUsername(username: string | undefined) {
        this.botUsername = username;
    }

    public isConfigured(): boolean {
        return Boolean(this.apiToken);
    }

    public async createSubscriptionInvoice(
        params: CreateSubscriptionInvoiceParams,
    ): Promise<CreateSubscriptionInvoiceResult> {
        if (!this.apiToken) {
            throw new Error('CRYPTOBOT_KEY is not set');
        }

        const paymentId = randomUUID();
        const payload = JSON.stringify({
            paymentId,
            userId: params.userId,
            plan: params.subscribePlan,
            type: params.subscribeType,
        });

        const paidBtnUrl = this.botUsername
            ? `https://t.me/${this.botUsername}`
            : undefined;

        const invoiceBody: Record<string, string | number> = {
            currency_type: 'fiat',
            fiat: 'USD',
            amount: String(params.amountUsd),
            description: `${BOT_NAME} — ${params.tariffLabel} / ${params.periodLabel}`,
            payload,
            expires_in: 3600,
        };

        if (paidBtnUrl) {
            invoiceBody.paid_btn_name = 'callback';
            invoiceBody.paid_btn_url = paidBtnUrl;
        }

        const response = await firstValueFrom(
            this.httpService.post<CryptoPayApiResponse<CryptoPayInvoice>>(
                `${CRYPTOBOT_API_URL}/createInvoice`,
                invoiceBody,
                {
                    headers: {
                        'Crypto-Pay-API-Token': this.apiToken,
                    },
                },
            ),
        );

        const invoice = response.data.result;

        if (!response.data.ok || !invoice) {
            const errorName = response.data.error?.name ?? 'unknown_error';
            this.logger.error(
                { error: response.data.error },
                'Crypto Pay createInvoice failed',
            );
            throw new Error(`Crypto Pay error: ${errorName}`);
        }

        await this.prismaService.payment.create({
            data: {
                userId: params.userId,
                cryptoPayInvoiceId: BigInt(invoice.invoice_id),
                subscribeType: params.subscribeType,
                subscribePlan: params.subscribePlan,
                amountUsd: String(params.amountUsd),
                payload,
            },
        });

        return {
            botInvoiceUrl: resolveSendPaymentUrl(invoice),
            amountUsd: params.amountUsd,
        };
    }

    public async pollPendingPayments(): Promise<ProcessInvoicePaidResult[]> {
        if (!this.apiToken) {
            return [];
        }

        const pendingPayments = await this.prismaService.payment.findMany({
            where: { status: PaymentStatus.PENDING },
            select: { cryptoPayInvoiceId: true },
        });

        if (pendingPayments.length === 0) {
            return [];
        }

        const invoiceIds = pendingPayments
            .map((payment) => payment.cryptoPayInvoiceId.toString())
            .join(',');

        const response = await firstValueFrom(
            this.httpService.get<CryptoPayApiResponse<GetInvoicesResult>>(
                `${CRYPTOBOT_API_URL}/getInvoices`,
                {
                    params: { invoice_ids: invoiceIds },
                    headers: {
                        'Crypto-Pay-API-Token': this.apiToken,
                    },
                },
            ),
        );

        if (!response.data.ok) {
            this.logger.error(
                { error: response.data.error },
                'Crypto Pay getInvoices failed',
            );
            return [];
        }

        const invoices = extractInvoices(response.data.result);
        const results: ProcessInvoicePaidResult[] = [];

        for (const invoice of invoices) {
            if (invoice.status === 'paid') {
                results.push(await this.processInvoicePaid(invoice.invoice_id));
                continue;
            }

            if (invoice.status === 'expired') {
                await this.markPaymentExpired(invoice.invoice_id);
            }
        }

        return results;
    }

    private async markPaymentExpired(invoiceId: number) {
        await this.prismaService.payment.updateMany({
            where: {
                cryptoPayInvoiceId: BigInt(invoiceId),
                status: PaymentStatus.PENDING,
            },
            data: { status: PaymentStatus.EXPIRED },
        });
    }

    public async processInvoicePaid(
        invoiceId: number,
    ): Promise<ProcessInvoicePaidResult> {
        return this.prismaService.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { cryptoPayInvoiceId: BigInt(invoiceId) },
                include: { user: true },
            });

            if (!payment) {
                this.logger.warn(
                    { invoiceId },
                    'Payment not found for invoice',
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
