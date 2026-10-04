/**
 * Выдаёт пользователю максимальную подписку (BUSINESS) на год (YEARLY).
 * Без Telegram-уведомлений — только вывод в терминал.
 *
 * Запуск: yarn run give_max_sub_yearn
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_SUBSCRIBE_TYPE = 'BUSINESS';
const MAX_SUBSCRIBE_PLAN = 'YEARLY';
const MAX_TOKENS = 14901;
const YEARLY_DURATION_DAYS = 12 * 30;

function loadEnv() {
    const envPath = resolve(__dirname, '../.env');
    try {
        const envContent = readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (!match) continue;
            const key = match[1];
            let value = match[2].trim();
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    } catch {
        // .env может отсутствовать, если переменные уже в окружении
    }
}

async function askTelegramUsername() {
    const rl = createInterface({ input, output });
    try {
        const raw = (
            await rl.question('Введите telegram_username (с @): ')
        ).trim();
        if (!raw.startsWith('@') || raw.length < 2) {
            throw new Error(
                'Username должен начинаться с @, например @username',
            );
        }
        return raw.slice(1);
    } finally {
        rl.close();
    }
}

async function main() {
    loadEnv();

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set');
    }

    const username = await askTelegramUsername();
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    try {
        const { rows } = await client.query(
            `
            SELECT
                id,
                "telegramId",
                "telegramUsername",
                "subscribeType",
                "subscribePlan",
                "subscriptionStartsAt",
                "subscriptionEndsAt",
                "isSubscriptionActive"
            FROM users
            WHERE LOWER("telegramUsername") = LOWER($1)
            LIMIT 1
            `,
            [username],
        );

        const user = rows[0];
        if (!user) {
            throw new Error(`Пользователь @${username} не найден в БД`);
        }

        const now = new Date();
        const hasActiveSubscription =
            user.isSubscriptionActive &&
            user.subscriptionEndsAt &&
            new Date(user.subscriptionEndsAt) > now;

        const subscriptionEndsAt = new Date(
            hasActiveSubscription ? user.subscriptionEndsAt : now,
        );
        subscriptionEndsAt.setDate(
            subscriptionEndsAt.getDate() + YEARLY_DURATION_DAYS,
        );

        const subscriptionStartsAt = hasActiveSubscription
            ? (user.subscriptionStartsAt ?? now)
            : now;

        const updated = await client.query(
            `
            UPDATE users
            SET
                "subscribeType" = $2,
                "subscribePlan" = $3,
                "subscriptionStartsAt" = $4,
                "subscriptionEndsAt" = $5,
                "isSubscriptionActive" = true,
                "lastSubscriptionType" = $6,
                "tokenLeft" = $7,
                "lastTokenIssueAt" = $8,
                "updatedAt" = $8
            WHERE id = $1
            RETURNING
                "telegramId",
                "telegramUsername",
                "subscribeType",
                "subscribePlan",
                "tokenLeft",
                "subscriptionEndsAt"
            `,
            [
                user.id,
                MAX_SUBSCRIBE_TYPE,
                MAX_SUBSCRIBE_PLAN,
                subscriptionStartsAt,
                subscriptionEndsAt,
                user.subscribeType,
                MAX_TOKENS,
                now,
            ],
        );

        const result = updated.rows[0];
        console.log('Готово: максимальная подписка на год выдана.');
        console.log(
            [
                `user: @${result.telegramUsername ?? username}`,
                `telegramId: ${result.telegramId}`,
                `plan: ${result.subscribeType} / ${result.subscribePlan}`,
                `tokens: ${result.tokenLeft}`,
                `endsAt: ${new Date(result.subscriptionEndsAt).toISOString()}`,
            ].join('\n'),
        );
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Ошибка: ${message}`);
    process.exit(1);
});
