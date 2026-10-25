import { createHmac } from 'crypto';
import type { Server } from 'http';
import type { CryptoInvoice } from '@/common/services/shkeeper';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getLoggerToken } from 'nestjs-pino';
import request from 'supertest';
import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { PaymentsController } from './payments.controller';
import { ShkeeperController } from '@/common/controllers/shkeeper.controller';
import { ShkeeperService } from '@/common/services/shkeeper';
import { TelegramJwtGuard } from '@/common/auth';
import { UserModelService } from '@/common/models/user';
import { PrismaService } from '@/common/services/prisma';
import { AntilopayService } from '@/common/services/antilopay';
import { TelegramStarsService } from '@/common/services/telegram-stars';
import { BotService } from '@/common/services/bot';
import type { Payment } from '@/generated/prisma/client';

jest.mock('@/common/services/bot', () => ({ BotService: class BotService {} }));

const ORDER = 'a7c2ec22-3fc5-4c25-8ffd-2314dd1b8481';
const payment = {
    id: 'payment',
    userId: 'owner',
    provider: 'SHKEEPER',
    orderId: ORDER,
    status: 'PENDING',
    subscribeType: 'LITE',
    subscribePlan: 'MONTHLY',
    amountUsd: '37',
    shkeeperNetwork: 'ton',
    shkeeperAddress: 'wallet',
    shkeeperAmountCrypto: '37.010000',
    shkeeperReceivedCrypto: '3',
    cryptoPayInvoiceId: null,
    createdAt: new Date(),
    paidAt: null,
} as Payment;

describe('SHKeeper payment HTTP contract', () => {
    let app: INestApplication<Server>;
    const prisma = { payment: { findFirst: jest.fn(), findMany: jest.fn() } };
    const http = { request: jest.fn() };
    const users = { getUserByTelegramId: jest.fn() };
    const bot = { sendMessage: jest.fn() };
    let service: ShkeeperService;
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [PaymentsController, ShkeeperController],
            providers: [
                ShkeeperService,
                {
                    provide: getLoggerToken(ShkeeperService.name),
                    useValue: { warn: jest.fn() },
                },
                {
                    provide: getLoggerToken(ShkeeperController.name),
                    useValue: { warn: jest.fn() },
                },
                {
                    provide: ConfigService,
                    useValue: new ConfigService({
                        SHKEEPER_API_URL: 'https://shkeeper.example',
                        SHKEEPER_API_KEY: 'api-key',
                        SHKEEPER_WEBHOOK_KEYS: 'old-key, current-key',
                        SHKEEPER_CALLBACK_URL:
                            'https://api.example/api/payments/shkeeper/callback',
                    }),
                },
                { provide: HttpService, useValue: http },
                { provide: PrismaService, useValue: prisma },
                { provide: UserModelService, useValue: users },
                { provide: BotService, useValue: bot },
                { provide: AntilopayService, useValue: {} },
                { provide: TelegramStarsService, useValue: {} },
            ],
        })
            .overrideGuard(TelegramJwtGuard)
            .useValue({
                canActivate: (ctx: {
                    switchToHttp: () => {
                        getRequest: () => {
                            headers: Record<string, string>;
                            user?: unknown;
                        };
                    };
                }) => {
                    const req = ctx.switchToHttp().getRequest();
                    if (req.headers.authorization !== 'Bearer test-token')
                        return false;
                    req.user = { id: 'owner', telegramId: '123' };
                    return true;
                },
            })
            .compile();
        service = module.get(ShkeeperService);
        app = module.createNestApplication({ rawBody: true, logger: false });
        app.useGlobalPipes(new ValidationPipe({ transform: true }));
        await app.init();
    });
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        prisma.payment.findFirst.mockResolvedValue(payment);
        prisma.payment.findMany.mockResolvedValue([payment]);
        http.request.mockReturnValue(
            of({
                data: {
                    status: 'success',
                    crypto_list: [{ name: 'TON-USDT' }],
                },
            }),
        );
    });
    afterAll(async () => {
        await app.close();
    });
    const get = (path: string) =>
        request(app.getHttpServer())
            .get(path)
            .set('Authorization', 'Bearer test-token');
    const post = (data: object) =>
        request(app.getHttpServer())
            .post('/api/payments/shkeeper')
            .set('Authorization', 'Bearer test-token')
            .send(data);
    it('requires authentication on networks, pending, detail and creation', async () => {
        for (const path of [
            '/api/payments/shkeeper/networks',
            '/api/payments/shkeeper/pending',
            `/api/payments/${ORDER}`,
        ]) {
            await request(app.getHttpServer()).get(path).expect(403);
        }
        await request(app.getHttpServer())
            .post('/api/payments/shkeeper')
            .send({})
            .expect(403);
    });
    it('matches static routes and returns networks/pending contracts', async () => {
        const networks = await get('/api/payments/shkeeper/networks').expect(
            200,
        );
        expect(networks.body).toEqual({
            networks: [{ id: 'ton', label: 'USDT · TON' }],
        });
        const pending = await get('/api/payments/shkeeper/pending').expect(200);
        expect(
            (pending.body as { payments: CryptoInvoice[] }).payments[0],
        ).toMatchObject({
            orderId: ORDER,
            network: 'ton',
            receivedCrypto: '3',
            expiresAt: null,
        });
        expect(prisma.payment.findFirst).not.toHaveBeenCalled();
        expect(prisma.payment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    userId: 'owner',
                    provider: 'SHKEEPER',
                    status: { not: 'PAID' },
                    shkeeperAddress: { not: null },
                    shkeeperAmountCrypto: { not: null },
                },
            }),
        );
    });
    it('returns enriched local detail without calling SHKeeper on every frontend poll', async () => {
        const response = await get(`/api/payments/${ORDER}`).expect(200);
        expect(response.body).toEqual({
            orderId: ORDER,
            status: 'PENDING',
            network: 'ton',
            address: 'wallet',
            amountCrypto: '37.010000',
            receivedCrypto: '3',
            expiresAt: null,
            subscribeType: 'LITE',
            subscribePlan: 'MONTHLY',
            amountUsd: '37',
        });
        expect(prisma.payment.findFirst).toHaveBeenCalledWith({
            where: { orderId: ORDER, userId: 'owner' },
        });
        expect(http.request).not.toHaveBeenCalled();
    });
    it('returns generic PAID detail when a lost creation response left no transfer instructions', async () => {
        prisma.payment.findFirst.mockResolvedValueOnce({
            ...payment,
            status: 'PAID',
            shkeeperAddress: null,
            shkeeperAmountCrypto: null,
            shkeeperInvoiceId: null,
        });
        const response = await get(`/api/payments/${ORDER}`).expect(200);
        expect(response.body as Record<string, unknown>).toMatchObject({
            orderId: ORDER,
            provider: 'SHKEEPER',
            status: 'PAID',
            amountUsd: '37',
        });
        expect(response.body as Record<string, unknown>).not.toHaveProperty(
            'address',
        );
        expect(http.request).not.toHaveBeenCalled();
    });
    it('returns actionable 503 for unresolved owner detail and repeated checkout, without provider requests', async () => {
        prisma.payment.findFirst.mockResolvedValue({
            ...payment,
            shkeeperAddress: null,
            shkeeperAmountCrypto: null,
        });
        const detail = await get(`/api/payments/${ORDER}`).expect(503);
        expect(detail.body as Record<string, unknown>).toMatchObject({
            orderId: ORDER,
        });
        const create = await post({
            subscribeType: 'LITE',
            subscribePlan: 'MONTHLY',
            network: 'ton',
        }).expect(503);
        expect(create.body as Record<string, unknown>).toMatchObject({
            orderId: ORDER,
        });
        expect(http.request).not.toHaveBeenCalled();
    });
    it('reuses an owner-scoped pending invoice on repeated checkout requests', async () => {
        const params = {
            subscribeType: 'LITE',
            subscribePlan: 'MONTHLY',
            network: 'ton',
            userId: 'another-owner',
        };
        const first = await post(params).expect(201);
        const second = await post(params).expect(201);
        expect(second.body as unknown).toEqual(first.body as unknown);
        expect(second.body as Record<string, unknown>).toMatchObject({
            orderId: ORDER,
            receivedCrypto: '3',
        });
        expect(prisma.payment.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    userId: 'owner',
                    provider: 'SHKEEPER',
                    status: 'PENDING',
                    subscribeType: 'LITE',
                    subscribePlan: 'MONTHLY',
                    shkeeperNetwork: 'ton',
                },
            }),
        );
        expect(http.request).not.toHaveBeenCalled();
    });
    it('does not reveal another owner’s invoice', async () => {
        prisma.payment.findFirst.mockResolvedValueOnce(null);
        await get(`/api/payments/${ORDER}`).expect(404);
    });
    it('keeps generic historical response serializable without leaking provider IDs', async () => {
        prisma.payment.findFirst.mockResolvedValueOnce({
            ...payment,
            provider: 'CRYPTO_PAY',
            cryptoPayInvoiceId: 123n,
        });
        const response = await get(`/api/payments/${ORDER}`).expect(200);
        const body = response.body as Record<string, unknown>;
        expect(body.provider).toBe('CRYPTO_PAY');
        expect(body.cryptoPayInvoiceId).toBeUndefined();
        expect(body.address).toBeUndefined();
    });
    it.each([
        { network: 'ethereum' },
        { network: '__proto__' },
        { subscribeType: 'FREE' },
        { subscribePlan: 'constructor' },
        { subscribeType: null },
        { network: null },
    ])(
        'validates DTO/tariff %p before contacting provider',
        async (overrides) => {
            await post({
                subscribeType: 'LITE',
                subscribePlan: 'MONTHLY',
                network: 'ton',
                ...overrides,
            }).expect(400);
            expect(http.request).not.toHaveBeenCalled();
        },
    );
    it('passes only owner/tariff/network; client money is never forwarded', async () => {
        const create = jest
            .spyOn(service, 'createSubscriptionInvoice')
            .mockResolvedValue(service.toCryptoInvoice(payment));
        await post({
            subscribeType: 'LITE',
            subscribePlan: 'MONTHLY',
            network: 'ton',
            amountUsd: '0.01',
            userId: 'victim',
        }).expect(201);
        expect(create).toHaveBeenCalledWith({
            userId: 'owner',
            subscribeType: 'LITE',
            subscribePlan: 'MONTHLY',
            network: 'ton',
        });
    });
    function webhook(
        raw: string,
        key = 'current-key',
        ts = String(Math.floor(Date.now() / 1000)),
    ) {
        const signature = createHmac('sha256', key)
            .update(`${ts}.`)
            .update(raw)
            .digest('hex');
        return request(app.getHttpServer())
            .post('/api/payments/shkeeper/callback')
            .set('Content-Type', 'application/json')
            .set('X-Shkeeper-Timestamp', ts)
            .set('X-Shkeeper-Signature', signature)
            .send(raw);
    }
    it('uses signed callback only as a hint, retrieving provider status instead of trusting paid/amount', async () => {
        http.request.mockReturnValue(
            of({
                data: {
                    status: 'success',
                    invoices: [
                        {
                            external_id: ORDER,
                            fiat: 'USD',
                            amount_fiat: '37',
                            status: 'UNPAID',
                            balance_fiat: '0',
                            txs: [
                                {
                                    amount: '100',
                                    crypto: 'TON-USDT',
                                    addr: 'wallet',
                                    txid: 'not-confirmed',
                                    status: 'UNCONFIRMED',
                                },
                            ],
                        },
                    ],
                },
            }),
        );
        // Stop at the transaction boundary; the real service has already validated the provider snapshot.
        const transaction = jest.fn().mockResolvedValue({ status: 'pending' });
        Object.assign(prisma, { $transaction: transaction });
        await webhook(
            JSON.stringify({
                external_id: ORDER,
                paid: true,
                status: 'PAID',
                balance_fiat: '999999',
            }),
        ).expect(200, { ok: true });
        expect(http.request).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `https://shkeeper.example/api/v1/invoices/${ORDER}`,
            }),
        );
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(bot.sendMessage).not.toHaveBeenCalled();
    });
    it('accepts the Endora namespace and rejects another project before provider lookup', async () => {
        const reconcile = jest
            .spyOn(service, 'reconcilePayment')
            .mockResolvedValue({ status: 'already_paid' });
        const externalId = `endora_${ORDER}`;
        await webhook(JSON.stringify({ external_id: externalId })).expect(200);
        expect(reconcile).toHaveBeenCalledWith(externalId);
        await webhook(
            JSON.stringify({ external_id: `pupupu_${ORDER}` }),
        ).expect(400);
        expect(reconcile).toHaveBeenCalledTimes(1);
    });
    it('accepts rotation keys and valid replays but reconciliation is idempotent', async () => {
        const reconcile = jest
            .spyOn(service, 'reconcilePayment')
            .mockResolvedValue({ status: 'already_paid' });
        const body = JSON.stringify({ external_id: ORDER });
        await webhook(body, 'old-key').expect(200);
        await webhook(body).expect(200);
        expect(reconcile).toHaveBeenCalledTimes(2);
        expect(bot.sendMessage).not.toHaveBeenCalled();
    });
    it('rejects invalid or stale webhook authentication before lookup', async () => {
        const reconcile = jest.spyOn(service, 'reconcilePayment');
        const body = JSON.stringify({ external_id: ORDER });
        await webhook(body, 'wrong-key').expect(401);
        await webhook(
            body,
            'current-key',
            String(Math.floor(Date.now() / 1000) - 301),
        ).expect(401);
        await request(app.getHttpServer())
            .post('/api/payments/shkeeper/callback')
            .send({ external_id: ORDER })
            .expect(401);
        expect(reconcile).not.toHaveBeenCalled();
    });
    it('rejects malformed callback identity and lets provider errors request a retry', async () => {
        const reconcile = jest
            .spyOn(service, 'reconcilePayment')
            .mockRejectedValue(new Error('provider unavailable'));
        await webhook('{"external_id":"not-an-order"}').expect(400);
        await webhook(JSON.stringify({ external_id: ORDER })).expect(500);
        expect(reconcile).toHaveBeenCalledTimes(1);
    });
});
