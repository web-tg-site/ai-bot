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

export type CreateAntilopayCheckoutParams = {
    userId: string;
    email: string;
    subscribeType: SubscribeType;
    subscribePlan: SubscribePlan;
    amountRub: number;
};

export type CreateAntilopayCheckoutResult = {
    checkoutUrl: string;
    amountRub: number;
    orderId: string;
};

function normalizePublicBaseUrl(raw: string | undefined): string | undefined {
    if (!raw) {
        return undefined;
    }

    let value = raw.trim().replace(/^["']|["']$/g, '');
    if (!value) {
        return undefined;
    }

    if (!/^https?:\/\//i.test(value)) {
        value = `https://${value}`;
    }

    value = value.replace(/\/$/, '');

    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') {
            return undefined;
        }
        return `${url.protocol}//${url.host}`;
    } catch {
        return undefined;
    }
}

function isNonPublicIp(ip: string): boolean {
    const v = ip.trim().toLowerCase();
    if (!v || v === 'unknown') {
        return true;
    }
    if (v === '127.0.0.1' || v === '::1' || v === '0.0.0.0') {
        return true;
    }
    if (
        v.startsWith('10.') ||
        v.startsWith('192.168.') ||
        v.startsWith('169.254.')
    ) {
        return true;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) {
        return true;
    }
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:')) {
        return true;
    }
    return false;
}

function ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.').map((p) => Number(p));
    if (
        parts.length !== 4 ||
        parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
    ) {
        return null;
    }
    return (
        (((parts[0] << 24) >>> 0) +
            (parts[1] << 16) +
            (parts[2] << 8) +
            parts[3]) >>>
        0
    );
}

function ipv4InCidr(ip: string, cidr: string): boolean {
    const [base, bitsRaw] = cidr.split('/');
    if (!base || bitsRaw === undefined) {
        return false;
    }
    const bits = Number(bitsRaw);
    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(base);
    if (ipInt === null || baseInt === null || !Number.isInteger(bits)) {
        return false;
    }
    if (bits < 0 || bits > 32) {
        return false;
    }
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
}

/** Cloudflare edge ranges — must not be sent as Antilopay customer.ip. */
const CLOUDFLARE_IPV4_CIDRS = [
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
] as const;

function isCloudflareIp(ip: string): boolean {
    const v = ip.trim().toLowerCase();
    if (!v) {
        return false;
    }
    if (v.includes(':')) {
        return (
            v.startsWith('2400:cb00:') ||
            v.startsWith('2606:4700:') ||
            v.startsWith('2803:f800:') ||
            v.startsWith('2405:b500:') ||
            v.startsWith('2405:8100:') ||
            v.startsWith('2a06:98c0:') ||
            v.startsWith('2c0f:f248:')
        );
    }
    return CLOUDFLARE_IPV4_CIDRS.some((cidr) => ipv4InCidr(v, cidr));
}

function isUsableClientIp(ip: string): boolean {
    return Boolean(ip) && !isNonPublicIp(ip) && !isCloudflareIp(ip);
}

function pushForwardedCandidates(
    candidates: string[],
    forwarded?: string | string[],
): void {
    if (typeof forwarded === 'string') {
        for (const part of forwarded.split(',')) {
            candidates.push(part.trim());
        }
        return;
    }
    if (Array.isArray(forwarded)) {
        for (const value of forwarded) {
            for (const part of value.split(',')) {
                candidates.push(part.trim());
            }
        }
    }
}

/**
 * Public client IP from proxy headers / socket.
 * Prefers CF-Connecting-IP (Cloudflare), skips private + Cloudflare edge IPs.
 */
export function extractClientIp(input: {
    cfConnectingIp?: string | string[];
    trueClientIp?: string | string[];
    forwardedFor?: string | string[];
    ip?: string;
    remoteAddress?: string;
}): string | undefined {
    const preferred: string[] = [];
    const rest: string[] = [];

    const pushOne = (target: string[], value?: string | string[]) => {
        if (typeof value === 'string' && value.trim()) {
            target.push(value.trim());
        } else if (Array.isArray(value)) {
            for (const item of value) {
                if (item?.trim()) {
                    target.push(item.trim());
                }
            }
        }
    };

    pushOne(preferred, input.cfConnectingIp);
    pushOne(preferred, input.trueClientIp);
    pushForwardedCandidates(rest, input.forwardedFor);
    if (input.ip) {
        rest.push(input.ip);
    }
    if (input.remoteAddress) {
        rest.push(input.remoteAddress);
    }

    for (const raw of [...preferred, ...rest]) {
        const cleaned = raw.replace(/^::ffff:/i, '').trim();
        if (isUsableClientIp(cleaned)) {
            return cleaned;
        }
    }

    return undefined;
}

@Injectable()
export class AntilopayService {
    private readonly secretId: string | undefined;
    private readonly privateKey: string | undefined;
    private readonly projectId: string | undefined;
    private readonly callbackPublicKey: string | undefined;
    private readonly publicBaseUrl: string | undefined;
    private readonly apiBaseUrl: string;
    private readonly vat: number | undefined;
    /** Empty = omit prefer_methods (use whatever gateways the project has). */
    private readonly preferMethods: string[];

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
        this.publicBaseUrl = normalizePublicBaseUrl(
            this.configService.get<string>('PUBLIC_BASE_URL'),
        );
        this.apiBaseUrl = (
            this.configService.get<string>('ANTILOPAY_API_URL')?.trim() ||
            ANTILOPAY_API_URL_DEFAULT
        ).replace(/\/$/, '');

        const vatRaw = this.configService.get<string>('ANTILOPAY_VAT')?.trim();
        if (vatRaw === '10' || vatRaw === '22') {
            this.vat = Number(vatRaw);
        }

        // Optional: "SBP,CARD_RU". Empty/unset = do not send prefer_methods (code 25 on prod if methods not enabled).
        this.preferMethods = (
            this.configService.get<string>('ANTILOPAY_PREFER_METHODS') ?? ''
        )
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean);

        if (this.isConfigured()) {
            this.logger.info(
                {
                    apiBaseUrl: this.apiBaseUrl,
                    preferMethods: this.preferMethods,
                },
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

    public getPublicBaseUrl(): string | undefined {
        return this.publicBaseUrl;
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

    /**
     * Creates a local PENDING payment and returns our HTTPS checkout URL.
     * Antilopay payment is created later when the user opens the link (real client IP).
     */
    public async createCheckoutSession(
        params: CreateAntilopayCheckoutParams,
    ): Promise<CreateAntilopayCheckoutResult> {
        if (!this.isConfigured() || !this.publicBaseUrl) {
            throw new Error('Antilopay is not configured');
        }

        const orderId = randomUUID();

        await this.prismaService.payment.create({
            data: {
                userId: params.userId,
                provider: PaymentProvider.ANTILOPAY,
                orderId,
                subscribeType: params.subscribeType,
                subscribePlan: params.subscribePlan,
                amountRub: String(params.amountRub),
            },
        });

        return {
            checkoutUrl: `${this.publicBaseUrl}/payments/antilopay/checkout/${orderId}`,
            amountRub: params.amountRub,
            orderId,
        };
    }

    /**
     * Creates Antilopay payment with the browser client IP and returns payment_url.
     */
    public async startCheckoutWithClientIp(
        orderId: string,
        clientIp: string,
        labels: { periodLabel: string; tariffLabel: string },
    ): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error('Antilopay is not configured');
        }

        if (isNonPublicIp(clientIp)) {
            throw new Error('Client IP is not a public address');
        }

        const payment = await this.prismaService.payment.findUnique({
            where: { orderId },
            include: { user: true },
        });

        if (
            !payment ||
            payment.provider !== PaymentProvider.ANTILOPAY ||
            payment.status !== PaymentStatus.PENDING
        ) {
            throw new Error('Checkout session not found');
        }

        if (payment.antilopayPaymentId) {
            const check = await this.checkPaymentStatus(orderId);
            if (check?.payment_url) {
                return check.payment_url;
            }
            throw new Error('Payment already created but URL is unavailable');
        }

        const email = payment.user.email;
        if (!email) {
            throw new Error('User email is missing');
        }

        const amountRub = Number(payment.amountRub);
        const productName = `${BOT_NAME} — ${labels.tariffLabel}`;
        const description = `${labels.tariffLabel} / ${labels.periodLabel}`;

        const body: Record<string, unknown> = {
            project_identificator: this.projectId,
            amount: amountRub,
            order_id: orderId,
            currency: 'RUB',
            product_name: productName,
            product_type: 'services',
            description,
            customer: {
                email,
                ip: clientIp,
            },
            merchant_extra: `userId=${payment.userId}`,
        };

        if (this.preferMethods.length > 0) {
            body.prefer_methods = this.preferMethods;
        }

        if (this.publicBaseUrl) {
            body.success_url = `${this.publicBaseUrl}/payments/antilopay/success`;
            body.fail_url = `${this.publicBaseUrl}/payments/antilopay/fail`;
        }

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
                {
                    code: response.data.code,
                    error: response.data.error,
                    orderId,
                    clientIp,
                },
                'Antilopay payment/create failed',
            );
            throw new Error(
                response.data.error ??
                    `Antilopay create failed: code ${response.data.code}`,
            );
        }

        await this.prismaService.payment.update({
            where: { id: payment.id },
            data: { antilopayPaymentId: response.data.payment_id },
        });

        this.logger.info(
            { orderId, clientIp, paymentId: response.data.payment_id },
            'Antilopay payment created with client IP',
        );

        return response.data.payment_url;
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
                antilopayPaymentId: { not: null },
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
