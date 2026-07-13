import { createHmac, timingSafeEqual } from 'crypto';

export function validateInitData(initData: string, botToken: string): boolean {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
        return false;
    }

    params.delete('hash');

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

    const calculatedHash = createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    try {
        return timingSafeEqual(
            Buffer.from(calculatedHash, 'hex'),
            Buffer.from(hash, 'hex'),
        );
    } catch {
        return false;
    }
}

export function getInitDataAuthDate(initData: string): number | null {
    const authDate = Number(new URLSearchParams(initData).get('auth_date'));
    return Number.isFinite(authDate) ? authDate : null;
}

type TelegramInitDataUser = {
    id: number;
    first_name: string;
    username?: string;
    language_code?: string;
};

export function parseInitDataUser(
    initData: string,
): TelegramInitDataUser | null {
    const userRaw = new URLSearchParams(initData).get('user');

    if (!userRaw) {
        return null;
    }

    try {
        return JSON.parse(userRaw) as TelegramInitDataUser;
    } catch {
        return null;
    }
}
