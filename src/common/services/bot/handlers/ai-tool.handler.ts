import {
    AiService,
    AiToolId,
    BotSession,
    StoredVoiceSample,
} from '@/common/services/ai';
import { AiFileInput, AiGenerationInput } from '@/common/services/ai/types';
import { isSharpiiMidjourneyUpstreamError } from '@/common/services/ai/providers/sharpii.provider';
import {
    getToolById,
    AI_TOOLS_REGISTRY,
} from '@/common/config/ai-tools.registry';
import { SubscribeType } from '@/generated/prisma/enums';
import { Context, Telegraf } from 'telegraf';
import { generateAiKeyboard } from '../keyboards';
import {
    extractFilesFromMessage,
    getMessageText,
    bufferToInputFile,
} from '../utils/download-telegram-file';
import {
    mimeTypeToExtension,
    parseDataUrl,
} from '@/common/utils/parse-data-url';
import {
    downloadRemoteFile,
    getAuthHeadersForUrl,
} from '@/common/utils/download-remote-file';
import { getToolsByCategory } from '@/common/config/ai-tools.registry';
import { BotHandlerDeps } from './global.handler';
import {
    getAllToolLabels,
    getI18nForUser,
    getToolIdByLabel,
    getToolInstruction,
    getToolLabel,
} from '../i18n';
import { isBackOrStartButton, isCategoryButton } from '../i18n/bot-actions';
import { registerLocalizedHears } from '../i18n/register-localized-hears';

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

export type AiHandlerDeps = BotHandlerDeps;

export const registerAiToolHandlers = (bot: Telegraf, deps: AiHandlerDeps) => {
    for (const tool of AI_TOOLS_REGISTRY) {
        registerLocalizedHears(
            bot,
            () => getAllToolLabels(tool.id),
            async (ctx) => {
                await selectTool(asBotContext(ctx), deps, tool.id);
            },
        );
    }

    bot.on('message', async (ctx, next) => {
        const session = getSession(ctx);
        const text = getMessageText(ctx);

        if (text && isCategoryButton(text)) {
            return next();
        }

        if (text && getToolIdByLabel(text)) {
            return next();
        }

        if (isBackOrStartButton(text) || text?.startsWith('/')) {
            if (session.ai) {
                session.ai = { step: 'idle' };
            }
            return next();
        }

        if (
            !session.ai?.activeToolId ||
            (session.ai.step !== 'awaiting_input' &&
                session.ai.step !== 'awaiting_voice_sample' &&
                session.ai.step !== 'awaiting_voice_text')
        ) {
            return next();
        }

        await processAiInput(asBotContext(ctx), deps);
    });
};

async function selectTool(
    ctx: BotContext,
    deps: AiHandlerDeps,
    toolId: AiToolId,
) {
    if (!ctx.from) return;

    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    const i18n = getI18nForUser(user);

    if (
        !user ||
        user.subscribeType === SubscribeType.NOT_SUBSCRIBED ||
        !user.isSubscriptionActive
    ) {
        await ctx.reply(i18n.aiResult.noSubscription, { parse_mode: 'HTML' });
        return;
    }

    const tool = getToolById(toolId);
    if (!tool) return;

    const session = getSession(ctx);
    session.ai = {
        activeToolId: toolId,
        step:
            toolId === AiToolId.VOICE_CLONE
                ? 'awaiting_voice_sample'
                : 'awaiting_input',
        chatHistory: toolId === AiToolId.GPT ? [] : undefined,
    };

    await deps.userModelService.updateUserLastActivityAt(
        ctx.from.id.toString(),
    );

    const label = getToolLabel(toolId, user.language);
    const instruction = getToolInstruction(toolId, user.language);
    const tools = getToolsByCategory(tool.category).map((t) =>
        getToolLabel(t.id, user.language),
    );

    await ctx.reply(i18n.aiResult.toolSelected(label, instruction), {
        ...generateAiKeyboard(i18n, tools),
        parse_mode: 'HTML',
    });
}

async function processAiInput(ctx: BotContext, deps: AiHandlerDeps) {
    if (!ctx.from) return;

    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    const i18n = getI18nForUser(user);

    const session = getSession(ctx);
    const toolId = session.ai?.activeToolId;
    if (!toolId) return;

    const tool = getToolById(toolId);
    if (!tool) return;

    const text = getMessageText(ctx);
    const files = await extractFilesFromMessage(ctx);

    if (toolId === AiToolId.VOICE_CLONE) {
        const cloneInput = await resolveVoiceCloneInput(
            ctx,
            session,
            text,
            files,
            tool,
            i18n,
        );
        if (!cloneInput) {
            return;
        }

        await runGeneration(
            ctx,
            deps,
            toolId,
            tool,
            cloneInput,
            session,
            text,
            i18n,
        );
        return;
    }

    if (!text && files.length === 0) {
        await ctx.reply(i18n.aiResult.sendTextOrFile);
        return;
    }

    const input: AiGenerationInput = {
        prompt: text,
        files: files.length ? files : undefined,
        durationSeconds: tool.defaultDurationSeconds,
        chatHistory: session.ai?.chatHistory,
    };

    await runGeneration(ctx, deps, toolId, tool, input, session, text, i18n);
}

async function resolveVoiceCloneInput(
    ctx: BotContext,
    session: BotSession,
    text: string | undefined,
    files: AiFileInput[],
    tool: NonNullable<ReturnType<typeof getToolById>>,
    i18n: ReturnType<typeof getI18nForUser>,
): Promise<AiGenerationInput | null> {
    const voiceSample = findVoiceSample(files);
    const step = session.ai?.step ?? 'awaiting_voice_sample';

    if (step === 'awaiting_voice_sample') {
        if (!voiceSample) {
            await ctx.reply(i18n.aiResult.voiceCloneNeedSample, {
                parse_mode: 'HTML',
            });
            return null;
        }

        if (!session.ai) {
            return null;
        }

        session.ai.voiceSample = serializeVoiceSample(voiceSample);
        session.ai.customVoiceId = `clone-${ctx.from?.id ?? 'user'}-${Date.now()}`;
        session.ai.step = 'awaiting_voice_text';
        await ctx.reply(i18n.aiResult.voiceCloneStep2, { parse_mode: 'HTML' });
        return null;
    }

    if (step === 'awaiting_voice_text') {
        if (!text?.trim()) {
            if (voiceSample && session.ai) {
                session.ai.voiceSample = serializeVoiceSample(voiceSample);
                session.ai.customVoiceId = `clone-${ctx.from?.id ?? 'user'}-${Date.now()}`;
                await ctx.reply(i18n.aiResult.voiceCloneSampleUpdated, {
                    parse_mode: 'HTML',
                });
                return null;
            }

            await ctx.reply(i18n.aiResult.voiceCloneNeedText, {
                parse_mode: 'HTML',
            });
            return null;
        }

        if (!session.ai?.voiceSample) {
            if (session.ai) {
                session.ai.step = 'awaiting_voice_sample';
            }
            await ctx.reply(i18n.aiResult.voiceCloneNeedSample, {
                parse_mode: 'HTML',
            });
            return null;
        }

        return {
            prompt: text.trim(),
            files: [deserializeVoiceSample(session.ai.voiceSample)],
            customVoiceId: session.ai.customVoiceId,
            durationSeconds: tool.defaultDurationSeconds,
        };
    }

    return null;
}

function findVoiceSample(files: AiFileInput[]): AiFileInput | undefined {
    return files.find(
        (file) =>
            file.mimeType.startsWith('audio/') ||
            file.mimeType === 'audio/ogg' ||
            file.mimeType.startsWith('video/'),
    );
}

function serializeVoiceSample(file: AiFileInput): StoredVoiceSample {
    return {
        data: file.buffer.toString('base64'),
        mimeType: file.mimeType,
        fileName: file.fileName,
    };
}

function deserializeVoiceSample(sample: StoredVoiceSample): AiFileInput {
    return {
        buffer: Buffer.from(sample.data, 'base64'),
        mimeType: sample.mimeType,
        fileName: sample.fileName,
    };
}

async function runGeneration(
    ctx: BotContext,
    deps: AiHandlerDeps,
    toolId: AiToolId,
    tool: NonNullable<ReturnType<typeof getToolById>>,
    input: AiGenerationInput,
    session: BotSession,
    text: string | undefined,
    i18n: ReturnType<typeof getI18nForUser>,
) {
    if (!ctx.from) return;

    const tokenCost = deps.tokenBillingService.calculateCost(
        tool,
        tool.defaultDurationSeconds,
    );

    const balanceCheck = await deps.tokenBillingService.checkBalance(
        ctx.from.id.toString(),
        tokenCost,
    );

    if (!balanceCheck.allowed) {
        await ctx.reply(i18n.aiResult.insufficientTokens, {
            parse_mode: 'HTML',
        });
        return;
    }

    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    if (!user) return;

    try {
        if (tool.isAsync) {
            try {
                if (toolId === AiToolId.VIDEO_TO_AUDIO) {
                    await ctx.reply(i18n.aiResult.videoToAudioPreparing);
                }

                await deps.aiJobService.createJob({
                    userId: user.id,
                    telegramId: ctx.from.id.toString(),
                    toolId,
                    input,
                });
                await ctx.reply(i18n.aiResult.asyncStarted);
                return;
            } catch (error) {
                const message = error instanceof Error ? error.message : '';
                if (
                    toolId === AiToolId.MIDJOURNEY &&
                    (message === 'INSUFFICIENT_TOKENS' ||
                        isSharpiiMidjourneyUpstreamError(message))
                ) {
                    if (message === 'INSUFFICIENT_TOKENS') {
                        throw error;
                    }

                    await ctx.reply(i18n.aiResult.midjourneyFallback);
                    await ctx.reply(i18n.aiResult.generating);

                    const generationResult = await deps.aiService.generate(
                        AiToolId.FLUX,
                        input,
                    );
                    const deduct = await deps.tokenBillingService.commit(
                        ctx.from.id.toString(),
                        tokenCost,
                    );
                    if (!deduct.success) {
                        await ctx.reply(i18n.aiResult.insufficientTokens, {
                            parse_mode: 'HTML',
                        });
                        return;
                    }

                    await sendGenerationResult(ctx, generationResult);
                    return;
                }

                throw error;
            }
        }

        await ctx.reply(i18n.aiResult.generating);

        const generationResult = await deps.aiService.generate(toolId, input);
        const actualCost = generationResult.actualTokenCost ?? tokenCost;

        const finalBalanceCheck = await deps.tokenBillingService.checkBalance(
            ctx.from.id.toString(),
            actualCost,
        );
        if (!finalBalanceCheck.allowed) {
            await ctx.reply(i18n.aiResult.insufficientTokens, {
                parse_mode: 'HTML',
            });
            return;
        }

        const deduct = await deps.tokenBillingService.commit(
            ctx.from.id.toString(),
            actualCost,
        );
        if (!deduct.success) {
            await ctx.reply(i18n.aiResult.insufficientTokens, {
                parse_mode: 'HTML',
            });
            return;
        }

        await sendGenerationResult(ctx, generationResult);

        if (toolId === AiToolId.GPT && generationResult.text && session.ai) {
            session.ai.chatHistory = [
                ...(session.ai.chatHistory ?? []),
                { role: 'user' as const, content: text ?? '[media]' },
                { role: 'assistant' as const, content: generationResult.text },
            ].slice(-20);
        }
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Unknown error';
        if (message === 'INSUFFICIENT_TOKENS') {
            await ctx.reply(i18n.aiResult.insufficientTokens, {
                parse_mode: 'HTML',
            });
            return;
        }
        await ctx.reply(i18n.aiResult.error(message), { parse_mode: 'HTML' });
    }
}

async function sendGenerationResult(
    ctx: BotContext,
    result: Awaited<ReturnType<AiService['generate']>>,
) {
    if (result.type === 'text' && result.text) {
        await ctx.reply(result.text, { parse_mode: 'HTML' });
        return;
    }

    if (result.url) {
        if (result.type === 'image') {
            const parsed = parseDataUrl(result.url);
            if (parsed) {
                const ext = mimeTypeToExtension(parsed.mimeType);
                await ctx.replyWithPhoto(
                    bufferToInputFile(parsed.buffer, `image.${ext}`),
                );
                return;
            }
            await ctx.replyWithPhoto(result.url);
        } else if (result.type === 'video') {
            const parsed = parseDataUrl(result.url);
            if (parsed) {
                const ext = mimeTypeToExtension(parsed.mimeType, 'mp4');
                await ctx.replyWithVideo(
                    bufferToInputFile(parsed.buffer, `video.${ext}`),
                );
                return;
            }
            const { buffer, mimeType } = await downloadRemoteFile(
                result.url,
                getAuthHeadersForUrl(result.url),
            );
            const ext = mimeTypeToExtension(mimeType, 'mp4');
            await ctx.replyWithVideo(bufferToInputFile(buffer, `video.${ext}`));
        } else if (result.type === 'audio') {
            const { buffer, mimeType } = await downloadRemoteFile(
                result.url,
                getAuthHeadersForUrl(result.url),
            );
            const ext = mimeTypeToExtension(mimeType, 'mp3');
            await ctx.replyWithAudio(bufferToInputFile(buffer, `audio.${ext}`));
        }
        return;
    }

    if (result.buffer) {
        if (result.type === 'image') {
            const ext = mimeTypeToExtension(
                result.mimeType ?? 'image/png',
                'png',
            );
            await ctx.replyWithPhoto(
                bufferToInputFile(result.buffer, `image.${ext}`),
            );
        } else if (result.type === 'video') {
            const ext = mimeTypeToExtension(
                result.mimeType ?? 'video/mp4',
                'mp4',
            );
            await ctx.replyWithVideo(
                bufferToInputFile(result.buffer, `video.${ext}`),
            );
        } else if (result.type === 'audio') {
            const ext = mimeTypeToExtension(
                result.mimeType ?? 'audio/mpeg',
                'mp3',
            );
            await ctx.replyWithAudio(
                bufferToInputFile(result.buffer, `audio.${ext}`),
            );
        }
    }
}
