import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
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
import { ANTILOPAY_API_URL_DEFAULT } from '@/common/config/antilopay.config';
import type { ProcessInvoicePaidResult } from '@/common/services/crypto-pay';
import {
    amountsEqualRub,
    compactJson,
    signAntilopayRequest,
    verifyAntilopayCallback,
} from './antilopay-crypto.util';

type AntilopayCreateResponse = {
    code: number;
    payment_id?: string;
    payment_url?: string;
    error?: string;
};

type AntilopayCheckResponse = {
    code: number;
    payment_id?: string;
    order_id?: string;
    payment_url?: string;
    amount?: number;
    original_amount?: number;
    status?: string;
    currency?: string;
    error?: string;
};

export type CreateAntilopayPaymentParams = {
    userId: string;
    email: string;
    subscribeType: SubscribeType;
    subscribePlan: SubscribePlan;
    amountRub: number;
    periodLabel: string;
    tariffLabel: string;
};

export type CreateAntilopayPaymentResult = {
    paymentUrl: string;
    amountRub: number;
    orderId: string;
};

@Injectable()
export class AntilopayService {
    private readonly secretId: string | undefined;
    private readonly privateKey: string | undefined;
    private readonly projectId: string | undefined;
    private readonly callbackPublicKey: string | undefined;
    private readonly publicBaseUrl: string | undefined;
    private readonly apiBaseUrl: string;
    private readonly vat: number | undefined;

    constructor(
        @InjectPinoLogger(AntilopayService.name)
        private readonly logger: PinoLogger,
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        private readonly prismaService: PrismaService,
        private readonly userModelService: UserModelService,
    ) {
        this.secretId = this.configService
            .get<string>('ANTILOPAY_SECRET_ID')
            ?.trim();
        this.privateKey = this.configService
            .get<string>('ANTILOPAY_PRIVATE_KEY')
            ?.trim();
        this.projectId = this.configService
            .get<string>('ANTILOPAY_PROJECT_ID')
            ?.trim();
        this.callbackPublicKey = this.configService
            .get<string>('ANTILOPAY_CALLBACK_PUBLIC_KEY')
            ?.trim();
        this.publicBaseUrl = this.configService
            .get<string>('PUBLIC_BASE_URL')
            ?.trim()
            ?.replace(/\/$/, '');
        this.apiBaseUrl = (
            this.configService.get<string>('ANTILOPAY_API_URL')?.trim() ||
            ANTILOPAY_API_URL_DEFAULT
        ).replace(/\/$/, '');

        const vatRaw = this.configService.get<string>('ANTILOPAY_VAT')?.trim();
        if (vatRaw === '10' || vatRaw === '22') {
            this.vat = Number(vatRaw);
        }

        if (this.isConfigured()) {
            this.logger.info(
                { apiBaseUrl: this.apiBaseUrl },
                'Antilopay configured',
            );
        }
    }

    public isConfigured(): boolean {
        return Boolean(
            this.secretId &&
            this.privateKey &&
            this.projectId &&
            this.callbackPublicKey &&
            this.publicBaseUrl,
        );
    }

    public verifyCallback(
        rawBody: string,
        signature: string | undefined,
    ): boolean {
        if (!this.callbackPublicKey || !signature) {
            return false;
        }

        try {
            return verifyAntilopayCallback(
                rawBody,
                signature,
                this.callbackPublicKey,
            );
        } catch (err) {
            this.logger.error(
                { err: err instanceof Error ? err.message : String(err) },
                'Antilopay callback signature verify failed',
            );
            return false;
        }
    }

    public async createSubscriptionPayment(
        params: CreateAntilopayPaymentParams,
    ): Promise<CreateAntilopayPaymentResult> {
        if (!this.isConfigured()) {
            throw new Error('Antilopay is not configured');
        }

        const orderId = randomUUID();
        const productName = `${BOT_NAME} — ${params.tariffLabel}`;
        const description = `${params.tariffLabel} / ${params.periodLabel}`;

        const body: Record<string, unknown> = {
            project_identificator: this.projectId,
            amount: params.amountRub,
            order_id: orderId,
            currency: 'RUB',
            product_name: productName,
            product_type: 'services',
            description,
            success_url: `${this.publicBaseUrl}/payments/antilopay/success`,
            fail_url: `${this.publicBaseUrl}/payments/antilopay/fail`,
            customer: {
                email: params.email,
            },
            prefer_methods: ['SBP', 'CARD_RU'],
            merchant_extra: `userId=${params.userId}`,
        };

        if (this.vat != null) {
            body.vat = this.vat;
        }

        const bodyJson = compactJson(body);
        const sign = signAntilopayRequest(bodyJson, this.privateKey!);

        const response = await firstValueFrom(
            this.httpService.post<AntilopayCreateResponse>(
                `${this.apiBaseUrl}/payment/create`,
                bodyJson,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Apay-Secret-Id': this.secretId!,
                        'X-Apay-Sign': sign,
                        'X-Apay-Sign-Version': '1',
                    },
                    transformRequest: [(data: string): string => data],
                },
            ),
        );

        if (response.data.code !== 0 || !response.data.payment_url) {
            this.logger.error(
                { code: response.data.code, error: response.data.error },
                'Antilopay payment/create failed',
            );
            throw new Error(
                response.data.error ??
                    `Antilopay create failed: code ${response.data.code}`,
            );
        }

        await this.prismaService.payment.create({
            data: {
                userId: params.userId,
                provider: PaymentProvider.ANTILOPAY,
                antilopayPaymentId: response.data.payment_id,
                orderId,
                subscribeType: params.subscribeType,
                subscribePlan: params.subscribePlan,
                amountRub: String(params.amountRub),
            },
        });

        return {
            paymentUrl: response.data.payment_url,
            amountRub: params.amountRub,
            orderId,
        };
    }

    public async processPaymentSuccess(
        orderId: string,
        originalAmount: number | string,
    ): Promise<ProcessInvoicePaidResult> {
        return this.prismaService.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { orderId },
                include: { user: true },
            });

            if (!payment || payment.provider !== PaymentProvider.ANTILOPAY) {
                this.logger.warn({ orderId }, 'Antilopay payment not found');
                return { status: 'not_found' as const };
            }

            if (payment.status === PaymentStatus.PAID) {
                return { status: 'already_paid' as const };
            }

            if (!amountsEqualRub(payment.amountRub, originalAmount)) {
                this.logger.error(
                    {
                        orderId,
                        expected: payment.amountRub,
                        received: originalAmount,
                    },
                    'Antilopay original_amount mismatch',
                );
                return { status: 'not_found' as const };
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

    public async markPaymentExpired(orderId: string): Promise<void> {
        await this.prismaService.payment.updateMany({
            where: {
                orderId,
                provider: PaymentProvider.ANTILOPAY,
                status: PaymentStatus.PENDING,
            },
            data: { status: PaymentStatus.EXPIRED },
        });
    }

    public async pollPendingPayments(): Promise<ProcessInvoicePaidResult[]> {
        if (!this.isConfigured()) {
            return [];
        }

        const pendingPayments = await this.prismaService.payment.findMany({
            where: {
                status: PaymentStatus.PENDING,
                provider: PaymentProvider.ANTILOPAY,
            },
            select: { orderId: true },
            take: 50,
        });

        if (pendingPayments.length === 0) {
            return [];
        }

        const results: ProcessInvoicePaidResult[] = [];

        for (const pending of pendingPayments) {
            try {
                const check = await this.checkPaymentStatus(pending.orderId);
                if (!check || check.code !== 0) {
                    continue;
                }

                if (check.status === 'SUCCESS') {
                    results.push(
                        await this.processPaymentSuccess(
                            pending.orderId,
                            check.original_amount ?? check.amount ?? 0,
                        ),
                    );
                    continue;
                }

                if (
                    check.status === 'FAIL' ||
                    check.status === 'CANCEL' ||
                    check.status === 'EXPIRED'
                ) {
                    await this.markPaymentExpired(pending.orderId);
                }
            } catch (err) {
                this.logger.error(
                    {
                        orderId: pending.orderId,
                        err: err instanceof Error ? err.message : String(err),
                    },
                    'Antilopay poll check failed',
                );
            }
        }

        return results;
    }

    private async checkPaymentStatus(
        orderId: string,
    ): Promise<AntilopayCheckResponse | null> {
        const body = {
            project_identificator: this.projectId,
            order_id: orderId,
        };
        const bodyJson = compactJson(body);
        const sign = signAntilopayRequest(bodyJson, this.privateKey!);

        const response = await firstValueFrom(
            this.httpService.post<AntilopayCheckResponse>(
                `${this.apiBaseUrl}/payment/check`,
                bodyJson,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Apay-Secret-Id': this.secretId!,
                        'X-Apay-Sign': sign,
                        'X-Apay-Sign-Version': '1',
                    },
                    transformRequest: [(data: string): string => data],
                },
            ),
        );

        return response.data;
    }
}
