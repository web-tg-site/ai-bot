import { Context } from 'telegraf';
import { createClient } from 'redis';
import { BotSession } from '@/common/services/ai';

const SESSION_PREFIX = 'telegraf:';

type RedisClient = ReturnType<typeof createClient>;

export function getBotSessionKey(ctx: Context): string | undefined {
    const fromId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (fromId == null || chatId == null) {
        return undefined;
    }

    return `${fromId}:${chatId}`;
}

export async function readBotSession(
    redisClient: RedisClient | null,
    ctx: Context,
): Promise<BotSession> {
    const key = getBotSessionKey(ctx);
    if (redisClient && key) {
        const value = await redisClient.get(SESSION_PREFIX + key);
        if (value) {
            return JSON.parse(value) as BotSession;
        }
        return {};
    }

    const botCtx = ctx as Context & { session?: BotSession };
    return botCtx.session ?? {};
}

export async function writeBotSession(
    redisClient: RedisClient | null,
    ctx: Context,
    session: BotSession,
): Promise<void> {
    const key = getBotSessionKey(ctx);
    if (!key) {
        return;
    }

    if (redisClient) {
        await redisClient.set(SESSION_PREFIX + key, JSON.stringify(session));
        return;
    }

    const botCtx = ctx as Context & { session?: BotSession };
    botCtx.session = session;
}

export async function withPersistedSession<T>(
    redisClient: RedisClient | null,
    ctx: Context,
    fn: (session: BotSession) => Promise<T>,
): Promise<T> {
    const session = await readBotSession(redisClient, ctx);
    const result = await fn(session);
    await writeBotSession(redisClient, ctx, session);
    return result;
}
