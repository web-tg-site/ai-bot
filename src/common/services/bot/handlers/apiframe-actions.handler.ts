import { Context, Telegraf } from 'telegraf';
import { AiToolId, BotSession } from '@/common/services/ai';
import { AiGenerationInput } from '@/common/services/ai/types';
import type { ApiframeAction } from '@/common/config/apiframe.config';
import { getI18nForUser } from '@/common/services/bot/i18n';
import type { BotHandlerDeps } from '../types/bot-handler-deps.type';

type AiHandlerDeps = BotHandlerDeps;
type BotContext = Context & { session: BotSession };

function asBotContext(ctx: Context): BotContext {
    return ctx as BotContext;
}

function getSession(ctx: Context): BotSession {
    const botCtx = asBotContext(ctx);
    if (!botCtx.session) {
        botCtx.session = {};
    }
    return botCtx.session;
}

export function registerApiframeActionHandlers(
    bot: Telegraf,
    deps: AiHandlerDeps,
) {
    bot.action(
        /^ai:mj:(upsample|variation):([1-4]):([a-f0-9-]+)$/i,
        async (ctx) => {
            const action = ctx.match[1].toLowerCase() as
                | 'upsample'
                | 'variation';
            const index = Number(ctx.match[2]) as 1 | 2 | 3 | 4;
            const jobId = ctx.match[3];
            await runImmediateMjAction(asBotContext(ctx), deps, {
                action,
                actionIndex: index,
                parentJobId: jobId,
            });
        },
    );

    bot.action(/^ai:mj:pan:(up|down|left|right):([a-f0-9-]+)$/i, async (ctx) => {
        const direction = ctx.match[1].toLowerCase() as
            | 'up'
            | 'down'
            | 'left'
            | 'right';
        await runImmediateMjAction(asBotContext(ctx), deps, {
            action: 'pan',
            actionDirection: direction,
            parentJobId: ctx.match[2],
        });
    });

    bot.action(/^ai:mj:outpaint:([a-f0-9-]+)$/i, async (ctx) => {
        await runImmediateMjAction(asBotContext(ctx), deps, {
            action: 'outpaint',
            parentJobId: ctx.match[1],
        });
    });

    bot.action(/^ai:mj:inpaint:([a-f0-9-]+)$/i, async (ctx) => {
        await handleMjInpaintStart(asBotContext(ctx), deps, ctx.match[1]);
    });

    bot.action(
        /^ai:suno:(extend|cover|add_vocals|stems):([12]):([a-f0-9-]+)$/i,
        async (ctx) => {
            const action = ctx.match[1].toLowerCase() as ApiframeAction;
            const index = Number(ctx.match[2]) as 1 | 2;
            const jobId = ctx.match[3];

            if (action === 'stems' || action === 'add_vocals') {
                await runImmediateSunoAction(asBotContext(ctx), deps, {
                    action,
                    actionIndex: index,
                    parentJobId: jobId,
                });
                return;
            }

            await handleSunoActionPrompt(asBotContext(ctx), deps, {
                action: action as 'extend' | 'cover',
                actionIndex: index,
                parentJobId: jobId,
            });
        },
    );
}

async function loadParentJob(
    deps: AiHandlerDeps,
    userId: string,
    parentJobId: string,
    expectedToolId: AiToolId,
) {
    const job = await deps.aiJobService.getCompletedJobForUser(
        parentJobId,
        userId,
    );
    if (!job?.providerJobId || job.toolId !== expectedToolId) {
        return null;
    }
    return job;
}

async function runImmediateMjAction(
    ctx: BotContext,
    deps: AiHandlerDeps,
    params: {
        action: ApiframeAction;
        parentJobId: string;
        actionIndex?: 1 | 2 | 3 | 4;
        actionDirection?: 'up' | 'down' | 'left' | 'right';
    },
) {
    try {
        await ctx.answerCbQuery();
    } catch {
        // ignore
    }
    if (!ctx.from) return;

    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    if (!user) return;

    const i18n = getI18nForUser(user);
    const parent = await loadParentJob(
        deps,
        user.id,
        params.parentJobId,
        AiToolId.MIDJOURNEY,
    );
    if (!parent?.providerJobId) {
        await ctx.reply('❌ Родительская генерация не найдена.');
        return;
    }

    const input: AiGenerationInput = {
        apiframeAction: params.action,
        parentJobId: parent.id,
        parentProviderJobId: parent.providerJobId,
        actionIndex: params.actionIndex,
        actionDirection: params.actionDirection,
        sourceGenerationId: parent.id,
    };

    try {
        await ctx.reply(i18n.aiResult.generating);
        await deps.aiJobService.createJob({
            userId: user.id,
            telegramId: ctx.from.id.toString(),
            toolId: AiToolId.MIDJOURNEY,
            input,
        });
        await ctx.reply(i18n.aiResult.asyncStarted);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Ошибка запуска';
        if (message === 'INSUFFICIENT_TOKENS') {
            await ctx.reply(i18n.aiResult.insufficientTokens, {
                parse_mode: 'HTML',
            });
            return;
        }
        await ctx.reply(i18n.aiResult.error(message), { parse_mode: 'HTML' });
    }
}

async function handleMjInpaintStart(
    ctx: BotContext,
    deps: AiHandlerDeps,
    parentJobId: string,
) {
    try {
        await ctx.answerCbQuery();
    } catch {
        // ignore
    }
    if (!ctx.from) return;

    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    if (!user) return;

    const i18n = getI18nForUser(user);
    const parent = await loadParentJob(
        deps,
        user.id,
        parentJobId,
        AiToolId.MIDJOURNEY,
    );
    if (!parent?.providerJobId) {
        await ctx.reply('❌ Родительская генерация не найдена.');
        return;
    }

    const session = getSession(ctx);
    if (!session.ai) {
        session.ai = { step: 'awaiting_input' };
    }
    session.ai.activeToolId = AiToolId.MIDJOURNEY;
    session.ai.awaitingMjInpaint = {
        parentJobId: parent.id,
        parentProviderJobId: parent.providerJobId,
    };

    await ctx.reply(i18n.aiResult.midjourneyInpaintPrompt, {
        parse_mode: 'HTML',
    });
}

async function runImmediateSunoAction(
    ctx: BotContext,
    deps: AiHandlerDeps,
    params: {
        action: ApiframeAction;
        parentJobId: string;
        actionIndex: 1 | 2;
        prompt?: string;
    },
) {
    try {
        await ctx.answerCbQuery();
    } catch {
        // ignore
    }
    if (!ctx.from) return;

    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    if (!user) return;

    const i18n = getI18nForUser(user);
    const parent = await loadParentJob(
        deps,
        user.id,
        params.parentJobId,
        AiToolId.SUNO,
    );
    if (!parent?.providerJobId) {
        await ctx.reply('❌ Родительская генерация не найдена.');
        return;
    }

    const input: AiGenerationInput = {
        apiframeAction: params.action,
        parentJobId: parent.id,
        parentProviderJobId: parent.providerJobId,
        actionIndex: params.actionIndex,
        sourceGenerationId: parent.id,
        prompt: params.prompt,
    };

    try {
        await ctx.reply(i18n.aiResult.generating);
        await deps.aiJobService.createJob({
            userId: user.id,
            telegramId: ctx.from.id.toString(),
            toolId: AiToolId.SUNO,
            input,
        });
        await ctx.reply(i18n.aiResult.asyncStarted);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Ошибка запуска';
        if (message === 'INSUFFICIENT_TOKENS') {
            await ctx.reply(i18n.aiResult.insufficientTokens, {
                parse_mode: 'HTML',
            });
            return;
        }
        await ctx.reply(i18n.aiResult.error(message), { parse_mode: 'HTML' });
    }
}

async function handleSunoActionPrompt(
    ctx: BotContext,
    deps: AiHandlerDeps,
    params: {
        action: 'extend' | 'cover';
        parentJobId: string;
        actionIndex: 1 | 2;
    },
) {
    try {
        await ctx.answerCbQuery();
    } catch {
        // ignore
    }
    if (!ctx.from) return;

    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    if (!user) return;

    const i18n = getI18nForUser(user);
    const parent = await loadParentJob(
        deps,
        user.id,
        params.parentJobId,
        AiToolId.SUNO,
    );
    if (!parent?.providerJobId) {
        await ctx.reply('❌ Родительская генерация не найдена.');
        return;
    }

    const session = getSession(ctx);
    if (!session.ai) {
        session.ai = { step: 'awaiting_input' };
    }
    session.ai.activeToolId = AiToolId.SUNO;
    session.ai.awaitingSunoAction = {
        action: params.action,
        parentJobId: parent.id,
        parentProviderJobId: parent.providerJobId,
        actionIndex: params.actionIndex,
    };

    const hint =
        params.action === 'extend'
            ? i18n.aiResult.sunoExtendPrompt
            : i18n.aiResult.sunoCoverPrompt;
    await ctx.reply(hint, { parse_mode: 'HTML' });
}

/** Called from processAiInput when session has awaitingMjInpaint / awaitingSunoAction. */
export async function tryHandlePendingApiframeFollowUp(
    ctx: BotContext,
    deps: AiHandlerDeps,
    params: {
        text?: string;
        files?: Array<{ buffer: Buffer; mimeType: string; fileName?: string }>;
    },
): Promise<boolean> {
    if (!ctx.from) return false;

    const session = getSession(ctx);
    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    if (!user || !session.ai) return false;

    const i18n = getI18nForUser(user);

    if (session.ai.awaitingMjInpaint) {
        const pending = session.ai.awaitingMjInpaint;
        const mask = params.files?.find((f) =>
            f.mimeType.startsWith('image/'),
        );
        if (!mask) {
            await ctx.reply(i18n.aiResult.midjourneyInpaintPrompt, {
                parse_mode: 'HTML',
            });
            return true;
        }

        session.ai.awaitingMjInpaint = undefined;
        const input: AiGenerationInput = {
            apiframeAction: 'inpaint',
            parentJobId: pending.parentJobId,
            parentProviderJobId: pending.parentProviderJobId,
            sourceGenerationId: pending.parentJobId,
            prompt: params.text?.trim() || undefined,
            files: [mask],
            attachmentRoles: ['mask'],
        };

        try {
            await ctx.reply(i18n.aiResult.generating);
            await deps.aiJobService.createJob({
                userId: user.id,
                telegramId: ctx.from.id.toString(),
                toolId: AiToolId.MIDJOURNEY,
                input,
            });
            await ctx.reply(i18n.aiResult.asyncStarted);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Ошибка запуска';
            if (message === 'INSUFFICIENT_TOKENS') {
                await ctx.reply(i18n.aiResult.insufficientTokens, {
                    parse_mode: 'HTML',
                });
            } else {
                await ctx.reply(i18n.aiResult.error(message), {
                    parse_mode: 'HTML',
                });
            }
        }
        return true;
    }

    if (session.ai.awaitingSunoAction) {
        const pending = session.ai.awaitingSunoAction;
        const text = params.text?.trim();
        if (!text) {
            const hint =
                pending.action === 'extend'
                    ? i18n.aiResult.sunoExtendPrompt
                    : i18n.aiResult.sunoCoverPrompt;
            await ctx.reply(hint, { parse_mode: 'HTML' });
            return true;
        }

        session.ai.awaitingSunoAction = undefined;
        const prompt = text === '.' ? undefined : text;
        const input: AiGenerationInput = {
            apiframeAction: pending.action,
            parentJobId: pending.parentJobId,
            parentProviderJobId: pending.parentProviderJobId,
            actionIndex: pending.actionIndex,
            sourceGenerationId: pending.parentJobId,
            prompt,
        };

        try {
            await ctx.reply(i18n.aiResult.generating);
            await deps.aiJobService.createJob({
                userId: user.id,
                telegramId: ctx.from.id.toString(),
                toolId: AiToolId.SUNO,
                input,
            });
            await ctx.reply(i18n.aiResult.asyncStarted);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Ошибка запуска';
            if (message === 'INSUFFICIENT_TOKENS') {
                await ctx.reply(i18n.aiResult.insufficientTokens, {
                    parse_mode: 'HTML',
                });
            } else {
                await ctx.reply(i18n.aiResult.error(message), {
                    parse_mode: 'HTML',
                });
            }
        }
        return true;
    }

    return false;
}
