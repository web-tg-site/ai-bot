import { randomUUID } from 'crypto';
import {
    BadGatewayException,
    BadRequestException,
    Injectable,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '@/common/services/prisma';
import { UserModelService } from '@/common/models/user';
import type { Payment } from '@/generated/prisma/client';
import {
    PaymentProvider,
    PaymentStatus,
    SubscribePlan,
    SubscribeType,
} from '@/generated/prisma/enums';
import { SUB_PLAN_TO_COST } from '@/common/services/bot/records';
import type { ProcessInvoicePaidResult } from '@/common/services/payment/payment.types';
import {
    decimal,
    isShkeeperNetwork,
    object,
    providerInteger,
    SHKEEPER_NETWORKS,
    SHKEEPER_ORDER_PREFIX,
    ShkeeperNetwork,
    validateInvoice,
    verifyWebhookSignature,
} from './shkeeper.validation';

export type CryptoInvoice = {
    orderId: string;
    status: PaymentStatus;
    network: ShkeeperNetwork;
    address: string;
    amountCrypto: string;
    receivedCrypto: string;
    expiresAt: string | null;
    subscribeType: SubscribeType;
    subscribePlan: SubscribePlan;
    amountUsd: string;
};

@Injectable()
export class ShkeeperService {
    private readonly apiUrl: string;
    private readonly apiKey: string;
    private readonly callbackUrl: string;
    private readonly webhookKeys: string[];

    constructor(
        @InjectPinoLogger(ShkeeperService.name)
        private readonly logger: PinoLogger,
        config: ConfigService,
        private readonly http: HttpService,
        private readonly prisma: PrismaService,
        private readonly users: UserModelService,
    ) {
        this.apiUrl =
            config
                .get<string>('SHKEEPER_API_URL')
                ?.trim()
                .replace(/\/+$/, '') ?? '';
        this.apiKey = config.get<string>('SHKEEPER_API_KEY')?.trim() ?? '';
        this.callbackUrl =
            config.get<string>('SHKEEPER_CALLBACK_URL')?.trim() ?? '';
        const keys = config
            .get<string>('SHKEEPER_WEBHOOK_KEYS')
            ?.split(',')
            .map((key) => key.trim())
            .filter(Boolean);
        this.webhookKeys = keys?.length ? keys : [this.apiKey];
        for (const [name, raw] of [
            ['SHKEEPER_API_URL', this.apiUrl],
            ['SHKEEPER_CALLBACK_URL', this.callbackUrl],
        ]) {
            if (!raw) continue;
            const url = new URL(raw);
            if (
                !['https:', 'http:'].includes(url.protocol) ||
                url.username ||
                url.password ||
                url.hash ||
                (name === 'SHKEEPER_API_URL' && url.search)
            ) {
                throw new Error(`Invalid ${name}`);
            }
            if (name === 'SHKEEPER_CALLBACK_URL' && url.protocol !== 'https:') {
                throw new Error('SHKEEPER_CALLBACK_URL must use HTTPS');
            }
        }
    }

    public isConfigured(): boolean {
        return Boolean(this.apiUrl && this.apiKey && this.callbackUrl);
    }

    public verifyCallback(
        rawBody: Buffer | undefined,
        timestamp: unknown,
        signature: unknown,
    ): boolean {
        return (
            this.isConfigured() &&
            verifyWebhookSignature(
                this.webhookKeys,
                timestamp,
                signature,
                rawBody,
            )
        );
    }

    private assertConfigured() {
        if (!this.isConfigured())
            throw new ServiceUnavailableException(
                'Crypto payments are temporarily unavailable',
            );
    }

    private async request(
        method: 'GET' | 'POST',
        path: string,
        data?: unknown,
    ): Promise<Record<string, unknown>> {
        this.assertConfigured();
        try {
            const response = await firstValueFrom(
                this.http.request<unknown>({
                    method,
                    url: `${this.apiUrl}/api/v1${path}`,
                    data,
                    headers: { 'X-Shkeeper-Api-Key': this.apiKey },
                    timeout: 10000,
                    maxRedirects: 0,
                    maxContentLength: 1024 * 1024,
                    maxBodyLength: 1024 * 1024,
                }),
            );
            const body = object(response.data);
            if (body.status !== 'success')
                throw new Error('Provider rejected request');
            return body;
        } catch {
            // Axios errors contain the API key in their request config; never log/return them.
            throw new BadGatewayException('SHKeeper request failed');
        }
    }

    public async getNetworks(): Promise<{
        networks: Array<{ id: ShkeeperNetwork; label: string }>;
    }> {
        const response = await this.request('GET', '/crypto');
        if (!Array.isArray(response.crypto_list))
            throw new BadGatewayException('Invalid SHKeeper currencies');
        const names = new Set(
            response.crypto_list.map((item: unknown) => object(item).name),
        );
        return {
            networks: (Object.keys(SHKEEPER_NETWORKS) as ShkeeperNetwork[])
                .filter((id) => names.has(SHKEEPER_NETWORKS[id].currency))
                .map((id) => ({ id, label: SHKEEPER_NETWORKS[id].label })),
        };
    }

    public async createSubscriptionInvoice(params: {
        userId: string;
        subscribeType: SubscribeType;
        subscribePlan: SubscribePlan;
        network: ShkeeperNetwork;
    }): Promise<CryptoInvoice> {
        if (
            !new Set<SubscribeType>([
                SubscribeType.LITE,
                SubscribeType.PRO,
                SubscribeType.BUSINESS,
            ]).has(params.subscribeType) ||
            !Object.hasOwn(SUB_PLAN_TO_COST, params.subscribePlan) ||
            !isShkeeperNetwork(params.network)
        ) {
            throw new BadRequestException('Invalid tariff or network');
        }
        const pendingWhere = {
            userId: params.userId,
            provider: PaymentProvider.SHKEEPER,
            status: PaymentStatus.PENDING,
            subscribeType: params.subscribeType,
            subscribePlan: params.subscribePlan,
            shkeeperNetwork: params.network,
        };
        const pendingQuery = {
            where: pendingWhere,
            orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        };
        // Recovery must not depend on provider availability or today's tariff price.
        const existing = await this.prisma.payment.findFirst(pendingQuery);
        if (existing) return this.toCryptoInvoice(existing);

        this.assertConfigured();
        const amountUsd = String(
            SUB_PLAN_TO_COST[params.subscribePlan][params.subscribeType].usdt,
        );
        if (decimal(amountUsd) === 0n)
            throw new BadRequestException('Invalid tariff price');
        const { networks } = await this.getNetworks();
        if (!networks.some(({ id }) => id === params.network))
            throw new BadRequestException('Network is unavailable');

        const reservation = await this.prisma.$transaction(async (tx) => {
            // Serialize the check/create across processes. Release before any provider request;
            // a racing checkout then sees this unresolved reservation instead of creating another.
            await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${params.userId} FOR UPDATE`;
            const pending = await tx.payment.findFirst(pendingQuery);
            if (pending) return { payment: pending, created: false };
            const payment = await tx.payment.create({
                data: {
                    orderId: `${SHKEEPER_ORDER_PREFIX}${randomUUID()}`,
                    userId: params.userId,
                    provider: PaymentProvider.SHKEEPER,
                    subscribeType: params.subscribeType,
                    subscribePlan: params.subscribePlan,
                    amountUsd,
                    shkeeperNetwork: params.network,
                    shkeeperReceivedCrypto: '0',
                },
            });
            return { payment, created: true };
        });
        const { payment } = reservation;
        if (!reservation.created) return this.toCryptoInvoice(payment);
        try {
            const body = await this.request(
                'POST',
                `/${SHKEEPER_NETWORKS[params.network].currency}/payment_request`,
                {
                    external_id: payment.orderId,
                    fiat: 'USD',
                    amount: amountUsd,
                    callback_url: this.callbackUrl,
                },
            );
            const id = providerInteger(body.id, true);
            providerInteger(body.recalculate_after);
            if (
                decimal(body.amount) === 0n ||
                typeof body.wallet !== 'string' ||
                !body.wallet.trim() ||
                body.wallet.length > 512
            ) {
                throw new Error('Invalid SHKeeper payment request');
            }
            const updated = await this.prisma.payment.update({
                where: { id: payment.id },
                data: {
                    shkeeperInvoiceId: id,
                    shkeeperAddress: body.wallet.trim(),
                    shkeeperAmountCrypto: body.amount as string,
                },
            });
            return this.toCryptoInvoice(updated);
        } catch {
            this.logger.warn(
                { orderId: payment.orderId },
                'SHKeeper creation incomplete; retained for reconciliation, do not blindly retry',
            );
            throw new ServiceUnavailableException({
                error: 'Crypto invoice setup is incomplete. Do not create another invoice; contact support with this orderId.',
                orderId: payment.orderId,
            });
        }
    }

    public toCryptoInvoice(payment: Payment): CryptoInvoice {
        if (
            !isShkeeperNetwork(payment.shkeeperNetwork) ||
            !payment.shkeeperAddress ||
            !payment.shkeeperAmountCrypto ||
            !payment.amountUsd
        ) {
            throw new ServiceUnavailableException({
                error: 'Crypto invoice setup is incomplete. Do not create another invoice; contact support with this orderId.',
                orderId: payment.orderId,
            });
        }
        return {
            orderId: payment.orderId,
            status: payment.status,
            network: payment.shkeeperNetwork,
            address: payment.shkeeperAddress,
            amountCrypto: payment.shkeeperAmountCrypto,
            receivedCrypto: payment.shkeeperReceivedCrypto ?? '0',
            expiresAt: null,
            subscribeType: payment.subscribeType,
            subscribePlan: payment.subscribePlan,
            amountUsd: payment.amountUsd,
        };
    }

    public async getPendingPayments(
        userId: string,
    ): Promise<{ payments: CryptoInvoice[] }> {
        const payments = await this.prisma.payment.findMany({
            where: {
                userId,
                provider: PaymentProvider.SHKEEPER,
                status: { not: PaymentStatus.PAID },
                shkeeperAddress: { not: null },
                shkeeperAmountCrypto: { not: null },
            },
            orderBy: { createdAt: 'desc' },
        });
        return {
            payments: payments.map((payment) => this.toCryptoInvoice(payment)),
        };
    }

    public async reconcilePayment(
        orderId: string,
    ): Promise<ProcessInvoicePaidResult> {
        const payment = await this.prisma.payment.findFirst({
            where: { orderId, provider: PaymentProvider.SHKEEPER },
        });
        if (!payment) return { status: 'not_found' };
        if (payment.status === PaymentStatus.PAID)
            return { status: 'already_paid' };
        if (!payment.amountUsd || !isShkeeperNetwork(payment.shkeeperNetwork))
            throw new Error('Invalid local SHKeeper payment');
        const response = await this.request(
            'GET',
            `/invoices/${encodeURIComponent(orderId)}`,
        );
        if (!Array.isArray(response.invoices))
            throw new Error('Invalid SHKeeper invoices');
        const matches = response.invoices.filter(
            (invoice: unknown) => object(invoice).external_id === orderId,
        );
        if (matches.length !== 1)
            throw new Error('SHKeeper invoice missing or ambiguous');
        const checked = validateInvoice(matches[0], {
            orderId,
            amountUsd: payment.amountUsd,
            network: payment.shkeeperNetwork,
            amountCrypto: payment.shkeeperAmountCrypto,
            address: payment.shkeeperAddress,
        });
        return this.prisma.$transaction(async (tx) => {
            // updateMany is a conditional row lock. A concurrent webhook/cron waits and then
            // rechecks status, so only one transaction can activate this order. It also serializes
            // partial snapshots, preventing an older provider response from reducing received funds.
            const claim = await tx.payment.updateMany({
                where: {
                    id: payment.id,
                    provider: PaymentProvider.SHKEEPER,
                    status: { not: PaymentStatus.PAID },
                },
                data: {
                    shkeeperLastCheckedAt: new Date(),
                    status: checked.paid
                        ? PaymentStatus.PAID
                        : PaymentStatus.PENDING,
                    ...(checked.paid ? { paidAt: new Date() } : {}),
                },
            });
            if (claim.count !== 1) return { status: 'already_paid' as const };
            const current = await tx.payment.findUniqueOrThrow({
                where: { id: payment.id },
                include: { user: true },
            });
            const receivedCrypto =
                decimal(current.shkeeperReceivedCrypto ?? '0') >
                decimal(checked.receivedCrypto)
                    ? current.shkeeperReceivedCrypto!
                    : checked.receivedCrypto;
            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    shkeeperReceivedCrypto: receivedCrypto,
                },
            });
            if (!checked.paid) return { status: 'pending' as const };
            const { subscriptionEndsAt } =
                await this.users.activatePaidSubscriptionInTransaction(
                    tx,
                    current.userId,
                    current.subscribeType,
                    current.subscribePlan,
                );
            return {
                status: 'activated' as const,
                telegramId: current.user.telegramId,
                subscribeType: current.subscribeType,
                subscribePlan: current.subscribePlan,
                subscriptionEndsAt,
            };
        });
    }

    public async pollPendingPayments(): Promise<ProcessInvoicePaidResult[]> {
        if (!this.isConfigured()) return [];
        const payments = await this.prisma.payment.findMany({
            where: {
                provider: PaymentProvider.SHKEEPER,
                status: { not: PaymentStatus.PAID },
            },
            orderBy: [
                { shkeeperLastCheckedAt: { sort: 'asc', nulls: 'first' } },
                { createdAt: 'asc' },
                { id: 'asc' },
            ],
            select: { orderId: true },
            take: 100,
        });
        const results: ProcessInvoicePaidResult[] = [];
        // Bounded batches; failures rotate too, so old/unreachable invoices cannot starve newer ones.
        for (let start = 0; start < payments.length; start += 5) {
            await Promise.all(
                payments.slice(start, start + 5).map(async ({ orderId }) => {
                    try {
                        results.push(await this.reconcilePayment(orderId));
                    } catch {
                        this.logger.warn(
                            { orderId },
                            'SHKeeper reconciliation failed; will retry',
                        );
                    } finally {
                        try {
                            await this.prisma.payment.updateMany({
                                where: {
                                    orderId,
                                    provider: PaymentProvider.SHKEEPER,
                                },
                                data: { shkeeperLastCheckedAt: new Date() },
                            });
                        } catch {
                            this.logger.warn(
                                { orderId },
                                'SHKeeper reconciliation timestamp update failed',
                            );
                        }
                    }
                }),
            );
        }
        return results;
    }
}
