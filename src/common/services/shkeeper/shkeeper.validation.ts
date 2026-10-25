import { createHmac, timingSafeEqual } from 'crypto';
import { isUUID } from 'class-validator';

export const SHKEEPER_ORDER_PREFIX = 'endora_';

export function isShkeeperOrderId(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    // Keep callbacks for UUID-only invoices created before namespacing recoverable.
    const uuid = value.startsWith(SHKEEPER_ORDER_PREFIX)
        ? value.slice(SHKEEPER_ORDER_PREFIX.length)
        : value;
    return isUUID(uuid, '4');
}

export const SHKEEPER_NETWORKS = {
    ton: {
        currency: 'TON-USDT',
        nativeFeeCurrency: 'TON',
        label: 'USDT · TON',
    },
    trc20: {
        currency: 'USDT',
        nativeFeeCurrency: 'TRX',
        label: 'USDT · TRON (TRC20)',
    },
    bep20: {
        currency: 'BNB-USDT',
        nativeFeeCurrency: 'BNB',
        label: 'USDT · BNB Smart Chain (BEP20)',
    },
} as const;
export type ShkeeperNetwork = keyof typeof SHKEEPER_NETWORKS;

export function isShkeeperNetwork(value: unknown): value is ShkeeperNetwork {
    return typeof value === 'string' && Object.hasOwn(SHKEEPER_NETWORKS, value);
}

const SCALE = 30;
const UNIT = 10n ** BigInt(SCALE);

// Reject JSON numbers, exponents, signs, NaN and excessive precision rather than round money.
export function decimal(value: unknown): bigint {
    if (typeof value !== 'string' || !/^\d{1,30}(?:\.\d{1,30})?$/.test(value)) {
        throw new Error('Invalid SHKeeper decimal');
    }
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * UNIT + BigInt(fraction.padEnd(SCALE, '0'));
}

export function decimalString(value: bigint): string {
    const fraction = (value % UNIT)
        .toString()
        .padStart(SCALE, '0')
        .replace(/0+$/, '');
    return `${value / UNIT}${fraction ? `.${fraction}` : ''}`;
}

export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid SHKeeper response');
    }
    return value as Record<string, unknown>;
}

export function providerInteger(value: unknown, positive = false): string {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
        throw new Error('Invalid SHKeeper integer');
    }
    const text = typeof value === 'number' ? String(value) : value;
    if (
        typeof text !== 'string' ||
        !/^\d{1,30}$/.test(text) ||
        (positive && BigInt(text) === 0n)
    ) {
        throw new Error('Invalid SHKeeper integer');
    }
    return BigInt(text).toString();
}

export function validateInvoice(
    input: unknown,
    expected: {
        orderId: string;
        amountUsd: string;
        network: ShkeeperNetwork;
        amountCrypto?: string | null;
        address?: string | null;
    },
): { paid: boolean; receivedCrypto: string } {
    const invoice = object(input);
    if (
        invoice.external_id !== expected.orderId ||
        invoice.fiat !== 'USD' ||
        decimal(invoice.amount_fiat) !== decimal(expected.amountUsd) ||
        !['UNPAID', 'PARTIAL', 'PAID', 'OVERPAID'].includes(
            String(invoice.status),
        ) ||
        !Array.isArray(invoice.txs)
    ) {
        throw new Error('SHKeeper invoice identity or status mismatch');
    }
    const balance = decimal(invoice.balance_fiat);
    const quote =
        expected.amountCrypto == null ? null : decimal(expected.amountCrypto);
    if (quote === 0n) throw new Error('Invalid local SHKeeper crypto quote');
    let received = 0n;
    const seen = new Set<string>();
    for (const raw of invoice.txs) {
        const tx = object(raw);
        // Provider invoice history may include native network fees alongside the token transfer.
        // Ignore only this network's native currency; its amount is not token settlement evidence.
        if (tx.crypto === SHKEEPER_NETWORKS[expected.network].nativeFeeCurrency)
            continue;
        if (tx.crypto !== SHKEEPER_NETWORKS[expected.network].currency) {
            throw new Error('SHKeeper transaction identity mismatch');
        }
        // Invoice.to_json includes both Transaction and UnconfirmedTransaction records.
        // Do not count an unconfirmed duplicate or treat a missing status as confirmation.
        if (tx.status === 'UNCONFIRMED') continue;
        if (tx.status !== 'CONFIRMED')
            throw new Error('SHKeeper transaction status mismatch');
        if (
            typeof tx.txid !== 'string' ||
            !tx.txid.trim() ||
            seen.has(tx.txid)
        ) {
            throw new Error('SHKeeper transaction identity mismatch');
        }
        if (
            tx.addr !== undefined &&
            (typeof tx.addr !== 'string' ||
                !tx.addr.trim() ||
                (expected.address != null && tx.addr !== expected.address))
        ) {
            throw new Error('SHKeeper transaction destination mismatch');
        }
        seen.add(tx.txid);
        const amount = tx.amount_crypto ?? tx.amount;
        if (
            tx.amount_crypto !== undefined &&
            tx.amount !== undefined &&
            decimal(tx.amount_crypto) !== decimal(tx.amount)
        ) {
            throw new Error('SHKeeper transaction amount mismatch');
        }
        received += decimal(amount);
    }
    const paid = invoice.status === 'PAID' || invoice.status === 'OVERPAID';
    // Upstream fiat balances can include native transfers; retain the original token bound when known.
    if (
        paid &&
        (balance < decimal(expected.amountUsd) ||
            received === 0n ||
            (quote !== null && received < quote))
    ) {
        throw new Error('SHKeeper paid invoice is underfunded');
    }
    return { paid, receivedCrypto: decimalString(received) };
}

export function verifyWebhookSignature(
    keys: string[],
    timestamp: unknown,
    signature: unknown,
    rawBody: Buffer | undefined,
    now = Date.now(),
): boolean {
    if (
        !rawBody ||
        typeof timestamp !== 'string' ||
        !/^\d{1,12}$/.test(timestamp) ||
        typeof signature !== 'string' ||
        !/^[a-fA-F0-9]{64}$/.test(signature) ||
        Math.abs(now / 1000 - Number(timestamp)) > 300
    ) {
        return false;
    }
    const provided = Buffer.from(signature, 'hex');
    return keys.some(
        (key) =>
            key.length > 0 &&
            timingSafeEqual(
                provided,
                createHmac('sha256', key)
                    .update(`${timestamp}.`)
                    .update(rawBody)
                    .digest(),
            ),
    );
}
