import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '@/common/services/prisma';
import { UserModelService } from '@/common/models/user';
import {
    PaymentProvider,
    PaymentStatus,
    SubscribePlan,
    SubscribeType,
} from '@/generated/prisma/enums';
import type { Payment } from '@/generated/prisma/client';
import { ShkeeperService } from './shkeeper.service';

const ORDER = 'a7c2ec22-3fc5-4c25-8ffd-2314dd1b8481';
const basePayment = (): Payment => ({
    id: 'payment-id',
    orderId: ORDER,
    userId: 'owner',
    provider: PaymentProvider.SHKEEPER,
    subscribeType: SubscribeType.LITE,
    subscribePlan: SubscribePlan.MONTHLY,
    amountUsd: '37',
    amountRub: null,
    amountStars: null,
    cryptoPayInvoiceId: null,
    antilopayPaymentId: null,
    telegramPaymentChargeId: null,
    status: PaymentStatus.PENDING,
    paidAt: null,
    createdAt: new Date('2020-01-01'),
    shkeeperInvoiceId: '91',
    shkeeperNetwork: 'ton',
    shkeeperAddress: 'ton-wallet',
    shkeeperAmountCrypto: '37.010000',
    shkeeperReceivedCrypto: '0',
    shkeeperLastCheckedAt: null,
});
// Pinned upstream Invoice.to_json/Transaction.to_json: fiat fields belong only to the invoice.
const providerInvoice = (status = 'PAID', amount = '37.010000') => ({
    status: 'success',
    invoices: [
        {
            external_id: ORDER,
            fiat: 'USD',
            amount_fiat: '37.00',
            balance_fiat: amount,
            status,
            txs: [
                {
                    txid: 'tx-1',
                    amount,
                    crypto: 'TON-USDT',
                    addr: 'ton-wallet',
                    status: 'CONFIRMED',
                },
            ],
        },
    ],
});

function setup(configOverrides: Record<string, string> = {}) {
    let state = basePayment();
    let exists = true;
    let queue: Promise<unknown> = Promise.resolve();
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const http = {
        request: jest.fn().mockReturnValue(of({ data: providerInvoice() })),
    };
    const payments = {
        findFirst: jest.fn(
            ({ where }: { where: Partial<Payment>; orderBy?: unknown }) =>
                Promise.resolve(
                    exists &&
                        Object.entries(where).every(
                            ([key, value]) =>
                                state[key as keyof Payment] === value,
                        )
                        ? { ...state }
                        : null,
                ),
        ),
        findUniqueOrThrow: jest.fn(() =>
            Promise.resolve({
                ...state,
                user: { telegramId: '123' },
            }),
        ),
        create: jest.fn(({ data }: { data: Partial<Payment> }) => {
            exists = true;
            state = {
                ...basePayment(),
                shkeeperAddress: null,
                shkeeperAmountCrypto: null,
                shkeeperInvoiceId: null,
                ...data,
            };
            return Promise.resolve({ ...state });
        }),
        update: jest.fn(({ data }: { data: Partial<Payment> }) => {
            state = { ...state, ...data };
            return Promise.resolve({ ...state });
        }),
        updateMany: jest.fn(
            ({
                where,
                data,
            }: {
                where: { status?: { not: PaymentStatus } };
                data: Partial<Payment>;
            }) => {
                if (where.status?.not === state.status)
                    return Promise.resolve({ count: 0 });
                state = { ...state, ...data };
                return Promise.resolve({ count: 1 });
            },
        ),
        findMany: jest.fn(() => Promise.resolve([{ ...state }])),
    };
    const tx = {
        payment: payments,
        $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
        payment: payments,
        // A serialized transactional fake models the row lock/rollback; a real PostgreSQL race
        // test is still required before rollout, not replaced by this unit-level fake.
        $transaction: jest.fn(
            <T>(callback: (client: typeof tx) => Promise<T>): Promise<T> => {
                const run = queue.then(async () => {
                    const before = { ...state };
                    const existedBefore = exists;
                    try {
                        return await callback(tx);
                    } catch (error) {
                        state = before;
                        exists = existedBefore;
                        throw error;
                    }
                });
                queue = run.catch(() => undefined);
                return run;
            },
        ),
    };
    const users = {
        activatePaidSubscriptionInTransaction: jest
            .fn()
            .mockResolvedValue({ subscriptionEndsAt: new Date('2027-01-01') }),
    };
    const config = new ConfigService({
        SHKEEPER_API_URL: 'https://shkeeper.example/',
        SHKEEPER_API_KEY: 'test-api-key',
        SHKEEPER_CALLBACK_URL:
            'https://api.example/api/payments/shkeeper/callback',
        ...configOverrides,
    });
    const service = new ShkeeperService(
        logger as unknown as PinoLogger,
        config,
        http as unknown as HttpService,
        prisma as unknown as PrismaService,
        users as unknown as UserModelService,
    );
    return {
        service,
        http,
        prisma,
        payments,
        users,
        logger,
        tx,
        clearPayment: () => {
            exists = false;
        },
        state: () => state,
        setState: (data: Partial<Payment>) => {
            state = { ...state, ...data };
        },
    };
}

describe('ShkeeperService', () => {
    it('reconciles prefixed external IDs without stripping the provider namespace', async () => {
        const t = setup();
        const orderId = `endora_${ORDER}`;
        t.setState({ orderId });
        const body = providerInvoice();
        body.invoices[0].external_id = orderId;
        t.http.request.mockReturnValue(of({ data: body }));
        await expect(
            t.service.reconcilePayment(orderId),
        ).resolves.toMatchObject({ status: 'activated' });
        expect(t.http.request).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `https://shkeeper.example/api/v1/invoices/${orderId}`,
            }),
        );
        expect(t.state().status).toBe(PaymentStatus.PAID);
    });
    it('lists only supported provider-enabled networks', async () => {
        const t = setup();
        t.http.request.mockReturnValue(
            of({
                data: {
                    status: 'success',
                    crypto_list: [
                        { name: 'TON-USDT' },
                        { name: 'USDT' },
                        { name: 'BNB-USDT' },
                        { name: 'BTC' },
                    ],
                },
            }),
        );
        expect(
            (await t.service.getNetworks()).networks.map(({ id }) => id),
        ).toEqual(['ton', 'trc20', 'bep20']);
    });
    it.each(['ton', 'trc20', 'bep20'] as const)(
        'creates %s from server prices and maps wallet/string IDs',
        async (network) => {
            const t = setup();
            t.clearPayment();
            t.http.request
                .mockReturnValueOnce(
                    of({
                        data: {
                            status: 'success',
                            crypto_list: [
                                { name: 'TON-USDT' },
                                { name: 'USDT' },
                                { name: 'BNB-USDT' },
                            ],
                        },
                    }),
                )
                .mockReturnValueOnce(
                    of({
                        data: {
                            status: 'success',
                            id: '91',
                            amount: '37.010000',
                            wallet: 'wallet',
                            display_name: 'USDT',
                            recalculate_after: '600',
                        },
                    }),
                );
            const invoice = await t.service.createSubscriptionInvoice({
                userId: 'owner',
                subscribeType: SubscribeType.LITE,
                subscribePlan: SubscribePlan.MONTHLY,
                network,
                amountUsd: '0.01',
            } as Parameters<ShkeeperService['createSubscriptionInvoice']>[0]);
            const currency = {
                ton: 'TON-USDT',
                trc20: 'USDT',
                bep20: 'BNB-USDT',
            }[network];
            expect(t.http.request).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    url: `https://shkeeper.example/api/v1/${currency}/payment_request`,
                    timeout: 10000,
                    maxRedirects: 0,
                    headers: { 'X-Shkeeper-Api-Key': 'test-api-key' },
                    data: {
                        external_id: invoice.orderId,
                        fiat: 'USD',
                        amount: '37',
                        callback_url:
                            'https://api.example/api/payments/shkeeper/callback',
                    },
                }),
            );
            expect(invoice.orderId).toMatch(/^endora_[0-9a-f-]{36}$/);
            expect(invoice).toMatchObject({
                status: 'PENDING',
                address: 'wallet',
                network,
                amountCrypto: '37.010000',
                amountUsd: '37',
                receivedCrypto: '0',
                expiresAt: null,
            });
        },
    );
    it.each([
        { subscribeType: SubscribeType.FREE },
        { subscribePlan: 'constructor' },
        { network: '__proto__' },
    ])('rejects invalid server-side input %p', async (extra) => {
        const t = setup();
        await expect(
            t.service.createSubscriptionInvoice({
                userId: 'owner',
                subscribeType: SubscribeType.LITE,
                subscribePlan: SubscribePlan.MONTHLY,
                network: 'ton',
                ...extra,
            } as Parameters<ShkeeperService['createSubscriptionInvoice']>[0]),
        ).rejects.toThrow('Invalid tariff or network');
        expect(t.payments.create).not.toHaveBeenCalled();
    });
    it('does not call provider when disabled', async () => {
        const t = setup({ SHKEEPER_API_KEY: '' });
        expect(t.service.isConfigured()).toBe(false);
        await expect(t.service.getNetworks()).rejects.toThrow(
            'temporarily unavailable',
        );
        expect(await t.service.pollPendingPayments()).toEqual([]);
        expect(t.http.request).not.toHaveBeenCalled();
    });
    it('retains identity after an ambiguous timeout and never logs Axios secrets', async () => {
        const t = setup();
        t.clearPayment();
        t.http.request
            .mockReturnValueOnce(
                of({
                    data: {
                        status: 'success',
                        crypto_list: [{ name: 'TON-USDT' }],
                    },
                }),
            )
            .mockReturnValueOnce(
                throwError(() => ({
                    message: 'secret test-api-key',
                    config: { headers: { secret: 'test-api-key' } },
                })),
            );
        await expect(
            t.service.createSubscriptionInvoice({
                userId: 'owner',
                subscribeType: SubscribeType.LITE,
                subscribePlan: SubscribePlan.MONTHLY,
                network: 'ton',
            }),
        ).rejects.toMatchObject({
            response: expect.objectContaining({
                error: 'Crypto invoice setup is incomplete. Do not create another invoice; contact support with this orderId.',
            }) as unknown,
        });
        expect(t.state()).toMatchObject({
            provider: 'SHKEEPER',
            status: 'PENDING',
            amountUsd: '37',
            shkeeperAddress: null,
        });
        expect(t.state().orderId).toBeTruthy();
        const callsBeforeRetry = t.http.request.mock.calls.length;
        await expect(
            t.service.createSubscriptionInvoice({
                userId: 'owner',
                subscribeType: SubscribeType.LITE,
                subscribePlan: SubscribePlan.MONTHLY,
                network: 'ton',
            }),
        ).rejects.toMatchObject({
            status: 503,
            response: { orderId: t.state().orderId },
        });
        expect(t.http.request).toHaveBeenCalledTimes(callsBeforeRetry);
        expect(t.payments.create).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(t.logger.warn.mock.calls)).not.toContain(
            'test-api-key',
        );
    });
    it('reuses a complete partial invoice without contacting the provider or changing its price', async () => {
        const t = setup();
        t.setState({ shkeeperReceivedCrypto: '3', amountUsd: '36' });
        const params = {
            userId: 'owner',
            subscribeType: SubscribeType.LITE,
            subscribePlan: SubscribePlan.MONTHLY,
            network: 'ton' as const,
        };
        const first = await t.service.createSubscriptionInvoice(params);
        expect(await t.service.createSubscriptionInvoice(params)).toEqual(
            first,
        );
        expect(first).toMatchObject({
            orderId: ORDER,
            receivedCrypto: '3',
            amountUsd: '36',
        });
        expect(t.http.request).not.toHaveBeenCalled();
        expect(t.payments.create).not.toHaveBeenCalled();
        expect(t.payments.findFirst).toHaveBeenCalledWith(
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
    });
    it('recovers existing checkout or its setup warning even when provider credentials are disabled', async () => {
        const t = setup({ SHKEEPER_API_KEY: '' });
        const params = {
            userId: 'owner',
            subscribeType: SubscribeType.LITE,
            subscribePlan: SubscribePlan.MONTHLY,
            network: 'ton' as const,
        };
        expect(
            (await t.service.createSubscriptionInvoice(params)).orderId,
        ).toBe(ORDER);
        t.setState({ shkeeperAddress: null, shkeeperAmountCrypto: null });
        await expect(
            t.service.createSubscriptionInvoice(params),
        ).rejects.toMatchObject({ status: 503, response: { orderId: ORDER } });
        expect(t.http.request).not.toHaveBeenCalled();
        expect(t.payments.create).not.toHaveBeenCalled();
    });
    it.each([
        { userId: 'another-owner' },
        { subscribeType: SubscribeType.PRO },
        { subscribePlan: SubscribePlan.YEARLY },
        { shkeeperNetwork: 'trc20' },
        { status: PaymentStatus.PAID },
    ])(
        'does not reuse a payment outside the exact owner/tariff/plan/network/pending scope %p',
        async (other) => {
            const t = setup();
            t.setState(other);
            t.http.request.mockReturnValue(
                of({
                    data: {
                        status: 'success',
                        crypto_list: [{ name: 'TON-USDT' }],
                        id: 92,
                        amount: '37',
                        wallet: 'new-wallet',
                        recalculate_after: 600,
                    },
                }),
            );
            const result = await t.service.createSubscriptionInvoice({
                userId: 'owner',
                subscribeType: SubscribeType.LITE,
                subscribePlan: SubscribePlan.MONTHLY,
                network: 'ton',
            });
            expect(result.orderId).not.toBe(ORDER);
            expect(t.payments.create).toHaveBeenCalledTimes(1);
            expect(t.state().userId).toBe('owner');
        },
    );
    it('blocks duplicate creation under simultaneous checkout requests while setup is unresolved', async () => {
        const t = setup();
        t.clearPayment();
        t.http.request.mockReturnValue(
            of({
                data: {
                    status: 'success',
                    crypto_list: [{ name: 'TON-USDT' }],
                    id: 92,
                    amount: '37',
                    wallet: 'new-wallet',
                    recalculate_after: 600,
                },
            }),
        );
        const params = {
            userId: 'owner',
            subscribeType: SubscribeType.LITE,
            subscribePlan: SubscribePlan.MONTHLY,
            network: 'ton' as const,
        };
        const results = await Promise.allSettled([
            t.service.createSubscriptionInvoice(params),
            t.service.createSubscriptionInvoice(params),
        ]);
        expect(t.payments.create).toHaveBeenCalledTimes(1);
        expect(
            t.http.request.mock.calls.filter(
                ([config]) => (config as { method: string }).method === 'POST',
            ),
        ).toHaveLength(1);
        expect(t.tx.$queryRaw).toHaveBeenCalled();
        expect((t.tx.$queryRaw.mock.calls as unknown[][])[0][1]).toBe('owner');
        for (const result of results) {
            if (result.status === 'fulfilled')
                expect(result.value.orderId).toBe(t.state().orderId);
            else
                expect(result.reason as unknown).toMatchObject({
                    status: 503,
                    response: { orderId: t.state().orderId },
                });
        }
        expect(results.some((result) => result.status === 'fulfilled')).toBe(
            true,
        );
    });
    it('keeps partial payments pending past quote recalculation time and prevents stale receipt regression', async () => {
        const t = setup();
        t.http.request.mockReturnValue(
            of({ data: providerInvoice('PARTIAL', '3') }),
        );
        expect(await t.service.reconcilePayment(ORDER)).toEqual({
            status: 'pending',
        });
        expect(t.state()).toMatchObject({
            status: 'PENDING',
            shkeeperReceivedCrypto: '3',
        });
        t.http.request.mockReturnValue(
            of({ data: providerInvoice('PARTIAL', '1') }),
        );
        await t.service.reconcilePayment(ORDER);
        expect(t.state().shkeeperReceivedCrypto).toBe('3');
        expect(t.service.toCryptoInvoice(t.state()).expiresAt).toBeNull();
        expect(
            t.users.activatePaidSubscriptionInTransaction,
        ).not.toHaveBeenCalled();
    });
    it('activates late full payments even from local EXPIRED state', async () => {
        const t = setup();
        t.setState({
            status: PaymentStatus.EXPIRED,
            shkeeperReceivedCrypto: '3',
        });
        expect((await t.service.reconcilePayment(ORDER)).status).toBe(
            'activated',
        );
        expect(t.state()).toMatchObject({
            status: 'PAID',
            shkeeperReceivedCrypto: '37.01',
        });
    });
    it('reconciles upstream confirmed/unconfirmed/native records without transaction fiat fields', async () => {
        const t = setup();
        const response = providerInvoice('PARTIAL', '3');
        response.invoices[0].txs.push(
            {
                txid: 'unconfirmed',
                amount: '100',
                crypto: 'TON-USDT',
                addr: 'ton-wallet',
                status: 'UNCONFIRMED',
            },
            {
                txid: 'native-fee',
                amount: '1',
                crypto: 'TON',
                addr: 'native-wallet',
                status: 'CONFIRMED',
            },
        );
        t.http.request.mockReturnValue(of({ data: response }));
        expect(await t.service.reconcilePayment(ORDER)).toEqual({
            status: 'pending',
        });
        expect(t.state().shkeeperReceivedCrypto).toBe('3');
        expect(
            t.users.activatePaidSubscriptionInTransaction,
        ).not.toHaveBeenCalled();
        const full = providerInvoice();
        full.invoices[0].txs.push(...response.invoices[0].txs.slice(1));
        t.http.request.mockReturnValue(of({ data: full }));
        expect((await t.service.reconcilePayment(ORDER)).status).toBe(
            'activated',
        );
        expect(t.state().shkeeperReceivedCrypto).toBe('37.01');
    });
    it('does not let unconfirmed tokens or native fiat value cover a short confirmed token payment', async () => {
        const t = setup();
        const response = providerInvoice('PAID', '3');
        response.invoices[0].balance_fiat = '37';
        response.invoices[0].txs.push(
            {
                txid: 'unconfirmed',
                amount: '100',
                crypto: 'TON-USDT',
                addr: 'ton-wallet',
                status: 'UNCONFIRMED',
            },
            {
                txid: 'native-fee',
                amount: '100',
                crypto: 'TON',
                addr: 'native-wallet',
                status: 'CONFIRMED',
            },
        );
        t.http.request.mockReturnValue(of({ data: response }));
        await expect(t.service.reconcilePayment(ORDER)).rejects.toThrow(
            'underfunded',
        );
        expect(
            t.users.activatePaidSubscriptionInTransaction,
        ).not.toHaveBeenCalled();
        expect(t.state().status).toBe('PENDING');
    });
    it('can reconcile an ambiguous creation with no saved quote/address using authoritative fiat and confirmed tokens', async () => {
        const t = setup();
        t.setState({ shkeeperAmountCrypto: null, shkeeperAddress: null });
        expect((await t.service.reconcilePayment(ORDER)).status).toBe(
            'activated',
        );
        expect(t.state().status).toBe('PAID');
    });
    it('claims atomically and activates only once for concurrent webhook/cron and later replays', async () => {
        const t = setup();
        const results = await Promise.all([
            t.service.reconcilePayment(ORDER),
            t.service.reconcilePayment(ORDER),
        ]);
        expect(results.map(({ status }) => status).sort()).toEqual([
            'activated',
            'already_paid',
        ]);
        expect(
            t.users.activatePaidSubscriptionInTransaction,
        ).toHaveBeenCalledTimes(1);
        const claim = t.payments.updateMany.mock.calls[0][0];
        expect(claim.where).toEqual({
            id: 'payment-id',
            provider: 'SHKEEPER',
            status: { not: 'PAID' },
        });
        expect(claim.data.status).toBe('PAID');
        expect(claim.data.paidAt).toBeInstanceOf(Date);
        expect(await t.service.reconcilePayment(ORDER)).toEqual({
            status: 'already_paid',
        });
        expect(
            t.users.activatePaidSubscriptionInTransaction,
        ).toHaveBeenCalledTimes(1);
    });
    it('rolls back the paid claim if subscription activation fails', async () => {
        const t = setup();
        t.users.activatePaidSubscriptionInTransaction.mockRejectedValueOnce(
            new Error('DB failure'),
        );
        await expect(t.service.reconcilePayment(ORDER)).rejects.toThrow(
            'DB failure',
        );
        expect(t.state().status).toBe('PENDING');
        expect((await t.service.reconcilePayment(ORDER)).status).toBe(
            'activated',
        );
    });
    it('rejects authoritative identity/amount mismatches, underpayments, and ambiguous invoices', async () => {
        for (const mutate of [
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices[0].fiat = 'RUB';
            },
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices[0].amount_fiat = '0.01';
            },
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices[0].balance_fiat = '36.999999999999999999';
            },
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices[0].txs[0].crypto = 'USDT';
            },
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices[0].external_id = 'another-order';
            },
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices[0].txs[0].addr = 'another-wallet';
            },
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices[0].txs[0].amount = '37.009999999999999999';
            },
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices[0].txs[0].status = 'UNCONFIRMED';
            },
            (body: ReturnType<typeof providerInvoice>) => {
                body.invoices.push(body.invoices[0]);
            },
        ]) {
            const t = setup();
            const response = providerInvoice();
            mutate(response);
            t.http.request.mockReturnValue(of({ data: response }));
            await expect(t.service.reconcilePayment(ORDER)).rejects.toThrow();
            expect(
                t.users.activatePaidSubscriptionInTransaction,
            ).not.toHaveBeenCalled();
            expect(t.state().status).toBe('PENDING');
        }
    });
    it('ignores unknown orders without making provider calls', async () => {
        const t = setup();
        t.payments.findFirst.mockResolvedValueOnce(null);
        expect(await t.service.reconcilePayment(ORDER)).toEqual({
            status: 'not_found',
        });
        expect(t.http.request).not.toHaveBeenCalled();
    });
    it('returns only owner-scoped ready unpaid invoices for recovery', async () => {
        const t = setup();
        expect(
            (await t.service.getPendingPayments('owner')).payments[0],
        ).toMatchObject({ orderId: ORDER, receivedCrypto: '0' });
        expect(t.payments.findMany).toHaveBeenCalledWith(
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
    it('reconciles partial invoices and rotates failures without expiring or starving them', async () => {
        const t = setup();
        t.http.request.mockReturnValue(throwError(() => new Error('timeout')));
        expect(await t.service.pollPendingPayments()).toEqual([]);
        expect(t.state().status).toBe('PENDING');
        expect(t.state().shkeeperLastCheckedAt).toBeInstanceOf(Date);
        expect(t.payments.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { provider: 'SHKEEPER', status: { not: 'PAID' } },
                take: 100,
                orderBy: [
                    { shkeeperLastCheckedAt: { sort: 'asc', nulls: 'first' } },
                    { createdAt: 'asc' },
                    { id: 'asc' },
                ],
            }),
        );
    });
});
