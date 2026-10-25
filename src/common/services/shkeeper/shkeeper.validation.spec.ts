import { createHmac } from 'crypto';
import {
    decimal,
    decimalString,
    isShkeeperNetwork,
    isShkeeperOrderId,
    providerInteger,
    validateInvoice,
    verifyWebhookSignature,
} from './shkeeper.validation';

const expected = {
    orderId: 'our-order',
    amountUsd: '7.83',
    network: 'bep20' as const,
    amountCrypto: '7.83',
    address: 'invoice-wallet',
};

// Match the pinned upstream serializers: transactions do not contain amount_fiat.
// https://github.com/vsys-host/shkeeper.io/blob/e6a41284cf36c3837a155339912480c4371e7b63/shkeeper/models.py
function transaction(overrides: Record<string, unknown> = {}) {
    return {
        amount: '3.00000000',
        crypto: 'BNB-USDT',
        addr: 'invoice-wallet',
        txid: '0xabc',
        status: 'CONFIRMED',
        ...overrides,
    };
}
function invoice(overrides: Record<string, unknown> = {}) {
    return {
        external_id: 'our-order',
        fiat: 'USD',
        amount_fiat: '7.830000',
        balance_fiat: '3.00',
        status: 'PARTIAL',
        txs: [transaction()],
        ...overrides,
    };
}

describe('SHKeeper exact validation', () => {
    it('accepts Endora invoice IDs and legacy UUIDs, but not other project prefixes', () => {
        const uuid = 'a7c2ec22-3fc5-4c25-8ffd-2314dd1b8481';
        expect(isShkeeperOrderId(`endora_${uuid}`)).toBe(true);
        expect(isShkeeperOrderId(uuid)).toBe(true);
        for (const value of [
            `pupupu_${uuid}`,
            `other_${uuid}`,
            'endora_',
            'endora_not-a-uuid',
            null,
        ]) {
            expect(isShkeeperOrderId(value)).toBe(false);
        }
    });
    it('compares and adds decimals without floating point rounding', () => {
        expect(decimal('0.1') + decimal('0.2')).toBe(decimal('0.30'));
        expect(decimal('9007199254740993.000000000000000001')).not.toBe(
            decimal('9007199254740993'),
        );
        expect(decimalString(decimal('007.830000'))).toBe('7.83');
    });
    it.each([
        '-1',
        '+1',
        '1e3',
        'NaN',
        'Infinity',
        '.5',
        '1.',
        '',
        ' 1',
        '1,00',
        '0.0000000000000000000000000000001',
        7.83,
        null,
    ])('rejects invalid money %p', (value) => {
        expect(() => decimal(value)).toThrow();
    });
    it('accepts numeric and string provider IDs without lossy conversion', () => {
        expect(providerInteger(91, true)).toBe('91');
        expect(providerInteger('9007199254740993', true)).toBe(
            '9007199254740993',
        );
        expect(providerInteger('600')).toBe('600');
        expect(() => providerInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow();
        expect(() => providerInteger('0', true)).toThrow();
    });
    it.each(['ton', 'trc20', 'bep20'])('supports %s', (network) =>
        expect(isShkeeperNetwork(network)).toBe(true),
    );
    it.each(['constructor', '__proto__', 'USDT', 'ethereum', null])(
        'rejects network %p',
        (network) => expect(isShkeeperNetwork(network)).toBe(false),
    );
    it('maps upstream partial transactions without requiring transaction-level fiat fields', () => {
        expect(validateInvoice(invoice(), expected)).toEqual({
            paid: false,
            receivedCrypto: '3',
        });
    });
    it.each(['PAID', 'OVERPAID'])(
        'accepts upstream %s with sufficient confirmed tokens and authoritative fiat balance',
        (status) => {
            expect(
                validateInvoice(
                    invoice({
                        status,
                        balance_fiat: '7.83',
                        txs: [transaction({ amount: '7.830000000000000001' })],
                    }),
                    expected,
                ),
            ).toEqual({ paid: true, receivedCrypto: '7.830000000000000001' });
        },
    );
    it('retains amount_crypto compatibility and requires both amount aliases to agree when present', () => {
        expect(
            validateInvoice(
                invoice({
                    status: 'PAID',
                    balance_fiat: '8',
                    txs: [
                        transaction({
                            amount: undefined,
                            amount_crypto: '8.000000000000000001',
                        }),
                    ],
                }),
                expected,
            ),
        ).toEqual({ paid: true, receivedCrypto: '8.000000000000000001' });
        expect(
            validateInvoice(
                invoice({ txs: [transaction({ amount_crypto: '3' })] }),
                expected,
            ).receivedCrypto,
        ).toBe('3');
        expect(() =>
            validateInvoice(
                invoice({ txs: [transaction({ amount_crypto: '4' })] }),
                expected,
            ),
        ).toThrow('amount mismatch');
    });
    it('keeps UNPAID/PARTIAL pending even if funds appear sufficient', () => {
        for (const status of ['UNPAID', 'PARTIAL']) {
            expect(
                validateInvoice(
                    invoice({
                        status,
                        balance_fiat: '8',
                        txs: [transaction({ amount: '8' })],
                    }),
                    expected,
                ).paid,
            ).toBe(false);
        }
        expect(
            validateInvoice(
                invoice({ status: 'UNPAID', balance_fiat: '0', txs: [] }),
                expected,
            ).receivedCrypto,
        ).toBe('0');
    });
    it('ignores UNCONFIRMED transfers, including a duplicate hash alongside its confirmed record', () => {
        const txs = [
            transaction(),
            transaction({ status: 'UNCONFIRMED' }),
            transaction({
                txid: 'not-yet-confirmed',
                amount: '1000',
                status: 'UNCONFIRMED',
            }),
        ];
        expect(validateInvoice(invoice({ txs }), expected)).toEqual({
            paid: false,
            receivedCrypto: '3',
        });
        expect(
            validateInvoice(
                invoice({
                    status: 'UNPAID',
                    balance_fiat: '0',
                    txs: txs.slice(1),
                }),
                expected,
            ),
        ).toEqual({ paid: false, receivedCrypto: '0' });
        expect(() =>
            validateInvoice(
                invoice({ status: 'PAID', balance_fiat: '8', txs }),
                expected,
            ),
        ).toThrow('underfunded');
        expect(() =>
            validateInvoice(
                invoice({
                    status: 'PAID',
                    balance_fiat: '8',
                    txs: txs.slice(1),
                }),
                expected,
            ),
        ).toThrow('underfunded');
    });
    it.each([undefined, null, '', 'confirmed', 'PENDING', 'FAILED'])(
        'does not infer confirmation from transaction status %p',
        (status) => {
            expect(() =>
                validateInvoice(
                    invoice({ txs: [transaction({ status })] }),
                    expected,
                ),
            ).toThrow('status mismatch');
        },
    );
    it.each([
        { external_id: 'another-order' },
        { fiat: 'RUB' },
        { amount_fiat: '7.830000000000000001' },
        { status: 'paid' },
        { status: 'CANCELLED' },
        { txs: null },
        { balance_fiat: 3 },
        { status: 'PAID' },
        { status: 'PAID', balance_fiat: '7.83', txs: [] },
        { txs: [transaction({ crypto: 'USDT' })] },
        { txs: [transaction({ amount: 'NaN' })] },
        { txs: [transaction({ txid: '' })] },
        { txs: [transaction({ txid: null })] },
    ])('fails closed on mismatched/malformed invoice %p', (overrides) => {
        expect(() => validateInvoice(invoice(overrides), expected)).toThrow();
    });
    it.each(['another-wallet', '', null, 123])(
        'rejects returned settlement destination %p',
        (addr) => {
            expect(() =>
                validateInvoice(
                    invoice({ txs: [transaction({ addr })] }),
                    expected,
                ),
            ).toThrow('destination mismatch');
        },
    );
    it('does not require an address omitted by a provider variant', () => {
        expect(
            validateInvoice(
                invoice({ txs: [transaction({ addr: undefined })] }),
                expected,
            ).receivedCrypto,
        ).toBe('3');
    });
    it('rejects fiat underfunding even if the provider labels sufficient crypto PAID', () => {
        expect(() =>
            validateInvoice(
                invoice({
                    status: 'PAID',
                    balance_fiat: '7.829999999999999999',
                    txs: [transaction({ amount: '8' })],
                }),
                expected,
            ),
        ).toThrow('underfunded');
    });
    it('rejects a crypto shortfall without tolerance even if the invoice fiat balance is sufficient', () => {
        expect(() =>
            validateInvoice(
                invoice({
                    status: 'PAID',
                    balance_fiat: '7.83',
                    txs: [transaction({ amount: '7.829999999999999999' })],
                }),
                expected,
            ),
        ).toThrow('underfunded');
    });
    it('sums separate confirmed transfers exactly against the original crypto quote', () => {
        expect(
            validateInvoice(
                invoice({
                    status: 'PAID',
                    balance_fiat: '7.83',
                    txs: [
                        transaction({ amount: '3' }),
                        transaction({ txid: 'top-up', amount: '4.83' }),
                    ],
                }),
                expected,
            ),
        ).toEqual({ paid: true, receivedCrypto: '7.83' });
    });
    it('does not use optional transaction fiat fields as settlement authority', () => {
        expect(
            validateInvoice(
                invoice({
                    status: 'PAID',
                    balance_fiat: '8',
                    txs: [
                        transaction({ amount: '8', amount_fiat: 'not-used' }),
                    ],
                }),
                expected,
            ).paid,
        ).toBe(true);
        expect(() =>
            validateInvoice(
                invoice({
                    status: 'PAID',
                    balance_fiat: '8',
                    txs: [transaction({ amount: '3', amount_fiat: '1000000' })],
                }),
                expected,
            ),
        ).toThrow('underfunded');
    });
    it.each([
        { network: 'ton' as const, currency: 'TON-USDT', fee: 'TON' },
        { network: 'trc20' as const, currency: 'USDT', fee: 'TRX' },
        { network: 'bep20' as const, currency: 'BNB-USDT', fee: 'BNB' },
    ])(
        'handles upstream confirmed/unconfirmed/native records for $network',
        ({ network, currency, fee }) => {
            const txs = [
                transaction({ amount: '8', crypto: currency }),
                transaction({
                    status: 'UNCONFIRMED',
                    amount: '100',
                    crypto: currency,
                }),
                transaction({
                    crypto: fee,
                    addr: 'native-fee-address',
                    amount: '0.001',
                }),
            ];
            expect(
                validateInvoice(
                    invoice({ status: 'PAID', balance_fiat: '8', txs }),
                    { ...expected, network },
                ),
            ).toEqual({ paid: true, receivedCrypto: '8' });
            expect(
                validateInvoice(
                    invoice({
                        txs: [{ ...txs[0], amount: '3' }, ...txs.slice(1)],
                    }),
                    { ...expected, network },
                ),
            ).toEqual({ paid: false, receivedCrypto: '3' });
            expect(() =>
                validateInvoice(
                    invoice({
                        status: 'PAID',
                        balance_fiat: '8',
                        txs: txs.slice(1),
                    }),
                    { ...expected, network },
                ),
            ).toThrow('underfunded');
            expect(() =>
                validateInvoice(
                    invoice({
                        status: 'PAID',
                        balance_fiat: '8',
                        txs: [
                            { ...txs[0], amount: '3' },
                            transaction({
                                txid: 'native-only-value',
                                amount: '5',
                                crypto: fee,
                            }),
                        ],
                    }),
                    { ...expected, network },
                ),
            ).toThrow('underfunded');
            expect(() =>
                validateInvoice(
                    invoice({ txs: [txs[0], transaction({ crypto: 'BTC' })] }),
                    { ...expected, network },
                ),
            ).toThrow('identity mismatch');
            expect(() =>
                validateInvoice(
                    invoice({
                        txs: [{ ...txs[0], amount: 'NaN' }, ...txs.slice(1)],
                    }),
                    { ...expected, network },
                ),
            ).toThrow('decimal');
        },
    );
    it('does not ignore a native currency from another network', () => {
        expect(() =>
            validateInvoice(
                invoice({ txs: [transaction({ crypto: 'TON' })] }),
                expected,
            ),
        ).toThrow('identity mismatch');
    });
    it('rejects duplicate confirmed transaction IDs rather than counting funds twice', () => {
        expect(() =>
            validateInvoice(
                invoice({ txs: [transaction(), transaction()] }),
                expected,
            ),
        ).toThrow('identity mismatch');
    });
    it('recovers ambiguous creations with no saved quote/address only from authoritative fiat and positive confirmed tokens', () => {
        const unknownInstructions = {
            ...expected,
            amountCrypto: null,
            address: null,
        };
        expect(
            validateInvoice(
                invoice({ status: 'PAID', balance_fiat: '7.83' }),
                unknownInstructions,
            ),
        ).toEqual({ paid: true, receivedCrypto: '3' });
        expect(() =>
            validateInvoice(
                invoice({ status: 'PAID', balance_fiat: '7.82' }),
                unknownInstructions,
            ),
        ).toThrow('underfunded');
        expect(() =>
            validateInvoice(
                invoice({
                    status: 'PAID',
                    balance_fiat: '8',
                    txs: [transaction({ status: 'UNCONFIRMED' })],
                }),
                unknownInstructions,
            ),
        ).toThrow('underfunded');
    });
    it.each(['0', '-1', 'NaN'])(
        'rejects invalid saved crypto quote %s',
        (amountCrypto) => {
            expect(() =>
                validateInvoice(invoice(), { ...expected, amountCrypto }),
            ).toThrow();
        },
    );
});

describe('SHKeeper webhook HMAC', () => {
    const now = 1791878400000;
    const timestamp = String(now / 1000);
    const body = Buffer.from('{"external_id":"our-order","paid":true}');
    const sign = (key: string, ts = timestamp, raw = body) =>
        createHmac('sha256', key).update(`${ts}.`).update(raw).digest('hex');
    it('accepts any configured rotation key', () => {
        expect(
            verifyWebhookSignature(
                ['old', 'current'],
                timestamp,
                sign('current'),
                body,
                now,
            ),
        ).toBe(true);
    });
    it('rejects missing raw bytes, changes to raw bytes, wrong keys and malformed signatures', () => {
        expect(
            verifyWebhookSignature(
                ['current'],
                timestamp,
                sign('current'),
                undefined,
                now,
            ),
        ).toBe(false);
        expect(
            verifyWebhookSignature(
                ['current'],
                timestamp,
                sign('current'),
                Buffer.concat([body, Buffer.from('\n')]),
                now,
            ),
        ).toBe(false);
        expect(
            verifyWebhookSignature(
                ['wrong'],
                timestamp,
                sign('current'),
                body,
                now,
            ),
        ).toBe(false);
        for (const signature of ['oops', '', 'a'.repeat(63)]) {
            expect(
                verifyWebhookSignature(
                    ['current'],
                    timestamp,
                    signature,
                    body,
                    now,
                ),
            ).toBe(false);
        }
    });
    it.each([-301, 301])(
        'rejects stale/future signed callbacks (%s seconds)',
        (seconds) => {
            const ts = String(now / 1000 + seconds);
            expect(
                verifyWebhookSignature(
                    ['current'],
                    ts,
                    sign('current', ts),
                    body,
                    now,
                ),
            ).toBe(false);
        },
    );
});
