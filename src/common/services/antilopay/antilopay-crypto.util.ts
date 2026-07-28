import {
    createSign,
    createVerify,
    createPrivateKey,
    createPublicKey,
} from 'crypto';

function wrapPem(
    base64OrPem: string,
    type: 'PRIVATE KEY' | 'RSA PRIVATE KEY' | 'PUBLIC KEY',
): string {
    const trimmed = base64OrPem.trim();
    if (trimmed.includes('BEGIN')) {
        return trimmed;
    }

    const body = trimmed.replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g)?.join('\n') ?? body;
    return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
}

/** Compact JSON string for Antilopay RSA signature (no spaces). */
export function compactJson(value: unknown): string {
    return JSON.stringify(value);
}

export function signAntilopayRequest(
    bodyJson: string,
    privateKeyBase64OrPem: string,
): string {
    const trimmed = privateKeyBase64OrPem.trim();
    let key: ReturnType<typeof createPrivateKey>;
    try {
        key = createPrivateKey(
            trimmed.includes('BEGIN')
                ? trimmed
                : wrapPem(trimmed, 'PRIVATE KEY'),
        );
    } catch {
        key = createPrivateKey(wrapPem(trimmed, 'RSA PRIVATE KEY'));
    }

    const signer = createSign('RSA-SHA256');
    signer.update(bodyJson);
    signer.end();
    return signer.sign(key, 'base64');
}

export function verifyAntilopayCallback(
    rawBody: string,
    signatureBase64: string,
    publicKeyBase64OrPem: string,
): boolean {
    const pem = wrapPem(publicKeyBase64OrPem, 'PUBLIC KEY');
    const key = createPublicKey(pem);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(key, signatureBase64, 'base64');
}

export function amountsEqualRub(
    stored: string | null | undefined,
    received: number | string,
): boolean {
    if (stored == null) {
        return false;
    }

    const a = Math.round(Number(stored) * 100);
    const b = Math.round(Number(received) * 100);

    return Number.isFinite(a) && Number.isFinite(b) && a === b;
}
