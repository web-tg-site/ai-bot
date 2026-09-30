import { randomUUID } from 'crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '@/common/services/prisma';
import { UserModelService } from '@/common/models/user';
import {
    PaymentProvider,
    PaymentStatus,
    SubscribePlan,
    SubscribeType,
} from '@/generated/prisma/enums';
import { BOT_NAME } from '@/common/config';
import { CRYPTOBOT_API_URL } from '@/common/config/cryptobot.config';

const CRYPTO_PAY_BOT_USERNAME = 'CryptoBot';

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

type CryptoPayAppInfo = {
    app_id: number;
    name: string;
    payment_processing_bot_username?: string;
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
    orderId: string;
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

function resolveCryptoBotPaymentUrl(invoice: CryptoPayInvoice): string {
    const raw =
        invoice.bot_invoice_url ??
        invoice.mini_app_invoice_url ??
        invoice.pay_url;

    // Предпочитаем @CryptoBot (mainnet), даже если API вернул ссылку на @send
    return raw.replace(
        /https?:\/\/t\.me\/(?:send|CryptoBot)\b/gi,
        `https://t.me/${CRYPTO_PAY_BOT_USERNAME}`,
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

function normalizeApiToken(raw: string | undefined): string | undefined {
    if (!raw) {
        return undefined;
    }

    const trimmed = raw.trim().replace(/^["']|["']$/g, '');
    return trimmed || undefined;
}

function tokenFingerprint(token: string): string {
    const [idPart = '', secretPart = ''] = token.split(':');
    const idHint = idPart.slice(0, 3);
    const secretHint = secretPart.slice(-4);
    return `${idHint}…:${secretHint || '????'} (len=${token.length})`;
}

@Injectable()
export class CryptoPayService implements OnModuleInit {
    private readonly apiToken: string | undefined;
    private readonly apiUrl: string;
    private botUsername: string | undefined;

    constructor(
        @InjectPinoLogger(CryptoPayService.name)
        private readonly logger: PinoLogger,
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        private readonly prismaService: PrismaService,
        private readonly userModelService: UserModelService,
    ) {
        this.apiToken = normalizeApiToken(
            this.configService.get<string>('CRYPTOBOT_KEY'),
        );
        this.apiUrl =
            normalizeApiToken(
                this.configService.get<string>('CRYPTOBOT_API_URL'),
            ) ?? CRYPTOBOT_API_URL;

        if (this.apiToken) {
            this.logger.info(
                {
                    apiUrl: this.apiUrl,
                    token: tokenFingerprint(this.apiToken),
                },
                'Crypto Pay configured (polling mode)',
            );
        } else {
            this.logger.warn('CRYPTOBOT_KEY is not set — crypto payments off');
        }
    }

    public async onModuleInit() {
        if (!this.apiToken) {
            return;
        }

        try {
            const response = await firstValueFrom(
                this.httpService.get<CryptoPayApiResponse<CryptoPayAppInfo>>(
                    `${this.apiUrl}/getMe`,
                    {
                        headers: {
                            'Crypto-Pay-API-Token': this.apiToken,
                        },
                    },
                ),
            );

            if (!response.data.ok || !response.data.result) {
                this.logger.error(
                    {
                        apiUrl: this.apiUrl,
                        token: tokenFingerprint(this.apiToken),
                        error: response.data.error,
                    },
                    'Crypto Pay getMe failed — CRYPTOBOT_KEY rejected by API',
                );
                return;
            }

            this.logger.info(
                {
                    appId: response.data.result.app_id,
                    appName: response.data.result.name,
                    paymentBot:
                        response.data.result.payment_processing_bot_username,
                },
                'Crypto Pay auth OK',
            );
        } catch (error) {
            const axiosError = error instanceof AxiosError ? error : undefined;
            const responseData: unknown = axiosError?.response?.data;
            let apiError: unknown = responseData;
            if (
                responseData &&
                typeof responseData === 'object' &&
                'error' in responseData
            ) {
                apiError = responseData.error;
            }

            this.logger.error(
                {
                    apiUrl: this.apiUrl,
                    token: tokenFingerprint(this.apiToken),
                    status: axiosError?.response?.status,
                    apiError,
                    err: error instanceof Error ? error.message : String(error),
                },
                'Crypto Pay getMe failed — CRYPTOBOT_KEY rejected by API',
            );
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

        const orderId = randomUUID();
        const payload = JSON.stringify({
            paymentId: orderId,
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

        let invoice: CryptoPayInvoice;

        try {
            const response = await firstValueFrom(
                this.httpService.post<CryptoPayApiResponse<CryptoPayInvoice>>(
                    `${this.apiUrl}/createInvoice`,
                    invoiceBody,
                    {
                        headers: {
                            'Crypto-Pay-API-Token': this.apiToken,
                        },
                    },
                ),
            );

            const result = response.data.result;

            if (!response.data.ok || !result) {
                const errorName = response.data.error?.name ?? 'unknown_error';
                this.logger.error(
                    {
                        error: response.data.error,
                        userId: params.userId,
                        amountUsd: params.amountUsd,
                        subscribeType: params.subscribeType,
                        subscribePlan: params.subscribePlan,
                    },
                    'Crypto Pay createInvoice failed',
                );
                throw new Error(`Crypto Pay error: ${errorName}`);
            }

            invoice = result;
        } catch (error) {
            if (
                !(error instanceof Error) ||
                !error.message.startsWith('Crypto Pay error:')
            ) {
                const axiosError =
                    error instanceof AxiosError ? error : undefined;
                const responseData: unknown = axiosError?.response?.data;
                let apiError: unknown = responseData;
                if (
                    responseData &&
                    typeof responseData === 'object' &&
                    'error' in responseData
                ) {
                    apiError = responseData.error;
                }

                this.logger.error(
                    {
                        err:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        status: axiosError?.response?.status,
                        apiError,
                        userId: params.userId,
                        amountUsd: params.amountUsd,
                        subscribeType: params.subscribeType,
                        subscribePlan: params.subscribePlan,
                    },
                    'Crypto Pay createInvoice failed',
                );
            }

            throw error instanceof Error ? error : new Error(String(error));
        }

        try {
            await this.prismaService.payment.create({
                data: {
                    userId: params.userId,
                    provider: PaymentProvider.CRYPTO_PAY,
                    cryptoPayInvoiceId: BigInt(invoice.invoice_id),
                    orderId,
                    subscribeType: params.subscribeType,
                    subscribePlan: params.subscribePlan,
                    amountUsd: String(params.amountUsd),
                },
            });
        } catch (error) {
            this.logger.error(
                {
                    err: error instanceof Error ? error.message : String(error),
                    invoiceId: invoice.invoice_id,
                    orderId,
                    userId: params.userId,
                },
                'Crypto Pay payment DB create failed after invoice',
            );
            throw error instanceof Error ? error : new Error(String(error));
        }

        return {
            botInvoiceUrl: resolveCryptoBotPaymentUrl(invoice),
            amountUsd: params.amountUsd,
            orderId,
        };
    }

    public async pollPendingPayments(): Promise<ProcessInvoicePaidResult[]> {
        if (!this.apiToken) {
            return [];
        }

        const pendingPayments = await this.prismaService.payment.findMany({
            where: {
                status: PaymentStatus.PENDING,
                provider: PaymentProvider.CRYPTO_PAY,
                cryptoPayInvoiceId: { not: null },
            },
            select: { cryptoPayInvoiceId: true },
        });

        if (pendingPayments.length === 0) {
            return [];
        }

        const invoiceIds = pendingPayments
            .map((payment) => payment.cryptoPayInvoiceId!.toString())
            .join(',');

        const response = await firstValueFrom(
            this.httpService.get<CryptoPayApiResponse<GetInvoicesResult>>(
                `${this.apiUrl}/getInvoices`,
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
