import {
    AiService,
    AiToolId,
    BotSession,
    StoredVoiceSample,
} from '@/common/services/ai';
import { AiFileInput, AiGenerationInput } from '@/common/services/ai/types';
import {
    isSharpiiMidjourneyUpstreamError,
    isSharpiiMidjourneyGenericFailure,
} from '@/common/services/ai/providers/sharpii.provider';
import {
    getToolById,
    AI_TOOLS_REGISTRY,
    calculateToolTokenCost,
} from '@/common/config/ai-tools.registry';
import {
    isImageToolWithAspectSettings,
    isImageToolWithReferences,
    isTopazTool,
    calculateTopazTokenCost,
} from '@/common/config/image-editor-capabilities.config';
import {
    getVideoMaxReferences,
    isVideoFlowTool,
} from '@/common/config/video-editor-capabilities.config';
import { MAX_IMAGE_REFERENCES } from '@/common/types/image-tool-settings.type';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { ImageToolSettings } from '@/common/types/image-tool-settings.type';
import { SubscribeType } from '@/generated/prisma/enums';
import { Context, Telegraf } from 'telegraf';
import { generateAiKeyboard } from '../keyboards';
import {
    extractFilesFromMessage,
    getMessageText,
    bufferToInputFile,
} from '../utils/download-telegram-file';
import { collectMediaGroupMessage } from '../utils/media-group-collector';
import {
    mimeTypeToExtension,
    parseDataUrl,
} from '@/common/utils/parse-data-url';
import {
    downloadRemoteFile,
    getAuthHeadersForUrl,
} from '@/common/utils/download-remote-file';
import { serializeGptUserMessage } from '@/common/utils/gpt-message-content';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';
import { markdownToTelegramHtml } from '@/common/utils/markdown-to-telegram-html';
import { getToolsByCategory } from '@/common/config/ai-tools.registry';
import { BotHandlerDeps } from './global.handler';
import {
    getAllToolLabels,
    getI18nForUser,
    getToolIdByLabel,
    getToolInstruction,
    getToolLabel,
} from '../i18n';
import {
    isBackOrStartButton,
    isCategoryButton,
    isMenuButton,
} from '../i18n/bot-actions';
import { registerLocalizedHears } from '../i18n/register-localized-hears';
import { generateGptControlKeyboard } from '../keyboards/gpt.keyboard';
import { generateImageEditorReplyKeyboard } from '../keyboards/image.keyboard';
import { generateVideoEditorReplyKeyboard } from '../keyboards/video.keyboard';
import {
    getGptSessionDefaults,
    resetAiSessionPreservingGpt,
} from '../utils/gpt-session';
import {
    buildNumberedReferencePrompt,
    deserializeReferences,
    serializeReference,
} from '../utils/image-references';
import {
    getInitialImageToolStep,
    loadImageToolSettings,
    goToImagePromptStep,
    getImageKeyboardMode,
} from '../utils/image-tool-session';
import {
    getImageToolCapabilities,
    isImageToolControlButton,
    resolveImageToolButtonAction,
} from '../utils/image-tool-buttons';
import {
    buildVideoSummaryLine,
    getVideoToolCapabilities,
    isVideoToolControlButton,
    resolveVideoToolButtonAction,
} from '../utils/video-tool-buttons';
import {
    getInitialVideoToolStep,
    loadVideoToolSettings,
    goToVideoPromptStep,
    getVideoKeyboardMode,
} from '../utils/video-tool-session';

type BotContext = Context & { session: BotSession };

function asBotContext(ctx: Context): BotContext {
    return ctx as BotContext;
}

function isImageFlowTool(toolId: AiToolId): boolean {
    return (
        isImageToolWithReferences(toolId) ||
        toolId === AiToolId.MIDJOURNEY ||
        isTopazTool(toolId)
    );
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

        if (text && isImageToolControlButton(text)) {
            const session = getSession(ctx);
            if (
                session.ai?.activeToolId &&
                isImageFlowTool(session.ai.activeToolId)
            ) {
                await processAiInput(asBotContext(ctx), deps);
                return;
            }
        }

        if (text && isVideoToolControlButton(text)) {
            const session = getSession(ctx);
            if (
                session.ai?.activeToolId &&
                isVideoFlowTool(session.ai.activeToolId)
            ) {
                await processAiInput(asBotContext(ctx), deps);
                return;
            }
        }

        if (isBackOrStartButton(text) || text?.startsWith('/')) {
            if (session.ai) {
                resetAiSessionPreservingGpt(session);
            }
            return next();
        }

        if (text && isMenuButton(text)) {
            if (session.ai) {
                resetAiSessionPreservingGpt(session);
            }
            return next();
        }

        if (
            !session.ai?.activeToolId ||
            (session.ai.step !== 'awaiting_input' &&
                session.ai.step !== 'awaiting_voice_sample' &&
                session.ai.step !== 'awaiting_voice_text' &&
                session.ai.step !== 'awaiting_image_references' &&
                session.ai.step !== 'awaiting_image_prompt' &&
                session.ai.step !== 'awaiting_video_references' &&
                session.ai.step !== 'awaiting_video_prompt')
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
    const gptDefaults = getGptSessionDefaults(session.ai);

    if (toolId === AiToolId.GPT) {
        const conversation =
            await deps.gptConversationModelService.getOrCreateActiveConversation(
                user.id,
                session.ai?.activeConversationId,
            );

        session.ai = {
            activeToolId: toolId,
            step: 'awaiting_input',
            activeConversationId: conversation.id,
            gptWebSearch: gptDefaults.gptWebSearch,
            gptReplyMode: gptDefaults.gptReplyMode,
        };
    } else if (isImageFlowTool(toolId)) {
        const toolSettings = await loadImageToolSettings(
            user.id,
            toolId,
            deps.userAiToolSettingsModelService,
            deps.imageCapabilitiesService,
        );

        session.ai = {
            activeToolId: toolId,
            step: getInitialImageToolStep(toolId),
            activeConversationId: session.ai?.activeConversationId,
            gptWebSearch: gptDefaults.gptWebSearch,
            gptReplyMode: gptDefaults.gptReplyMode,
            referenceFiles: [],
            toolSettings,
            imageKeyboardMode: 'main',
            activeCategory: session.ai?.activeCategory,
        };
    } else if (isVideoFlowTool(toolId)) {
        const toolSettings = await loadVideoToolSettings(
            user.id,
            toolId,
            deps.userAiToolSettingsModelService,
            deps.videoCapabilitiesService,
        );

        session.ai = {
            activeToolId: toolId,
            step: getInitialVideoToolStep(toolId),
            activeConversationId: session.ai?.activeConversationId,
            gptWebSearch: gptDefaults.gptWebSearch,
            gptReplyMode: gptDefaults.gptReplyMode,
            referenceFiles: [],
            toolSettings,
            videoKeyboardMode: 'main',
            activeCategory: session.ai?.activeCategory,
        };
    } else {
        session.ai = {
            activeToolId: toolId,
            step:
                toolId === AiToolId.VOICE_CLONE
                    ? 'awaiting_voice_sample'
                    : 'awaiting_input',
            activeConversationId: session.ai?.activeConversationId,
            gptWebSearch: gptDefaults.gptWebSearch,
            gptReplyMode: gptDefaults.gptReplyMode,
        };
    }

    await deps.userModelService.updateUserLastActivityAt(
        ctx.from.id.toString(),
    );

    const label = getToolLabel(toolId, user.language);
    const instruction = getToolInstruction(toolId, user.language);
    const keyboardCategory = session.ai?.activeCategory ?? tool.category;

    if (isImageFlowTool(toolId)) {
        const settings = session.ai.toolSettings ?? {};
        const caps = getImageToolCapabilities(
            toolId,
            deps.imageCapabilitiesService,
        );
        const parts = [i18n.aiResult.toolSelected(label, instruction)];

        if (isImageToolWithAspectSettings(toolId) && caps.aspectRatios.length) {
            parts.push(
                i18n.imageTool.formatLine(
                    settings.aspectRatio ?? caps.aspectRatios[0],
                    caps.resolutions.length
                        ? (settings.resolution ?? caps.resolutions[0])
                        : undefined,
                ),
            );
        }

        await ctx.reply(parts.join('\n\n'), {
            ...generateImageEditorReplyKeyboard(i18n, {
                toolId,
                settings,
                aspectRatios: caps.aspectRatios,
                resolutions: caps.resolutions,
                topazScales: caps.topazScales,
                step: session.ai.step,
                keyboardMode: 'main',
            }),
            parse_mode: 'HTML',
        });
    } else if (isVideoFlowTool(toolId)) {
        const settings = (session.ai.toolSettings ?? {}) as VideoToolSettings;
        const caps = getVideoToolCapabilities(
            toolId,
            deps.videoCapabilitiesService,
            i18n.localeTag,
        );
        const parts = [i18n.aiResult.toolSelected(label, instruction)];

        const summary = buildVideoSummaryLine(i18n, {
            settings,
            aspectRatios: caps.aspectRatios,
            resolutions: caps.resolutions,
            toolId,
            localeTag: i18n.localeTag,
            capabilitiesService: deps.videoCapabilitiesService,
        });
        if (summary) {
            parts.push(summary);
        }

        await ctx.reply(parts.join('\n\n'), {
            ...generateVideoEditorReplyKeyboard(i18n, {
                toolId,
                settings,
                aspectRatios: caps.aspectRatios,
                resolutions: caps.resolutions,
                durations: caps.durations,
                stylePresets: caps.stylePresets,
                step: session.ai.step,
                keyboardMode: 'main',
                localeTag: i18n.localeTag,
            }),
            parse_mode: 'HTML',
        });
    } else {
        const tools = getToolsByCategory(keyboardCategory).map((t) =>
            getToolLabel(t.id, user.language),
        );

        await ctx.reply(i18n.aiResult.toolSelected(label, instruction), {
            ...generateAiKeyboard(i18n, tools),
            parse_mode: 'HTML',
        });
    }

    if (toolId === AiToolId.GPT) {
        await ctx.reply(i18n.gptChat.controlsHint, {
            ...generateGptControlKeyboard(i18n, {
                webSearch: session.ai.gptWebSearch !== false,
                replyMode: session.ai.gptReplyMode ?? 'text',
            }),
            parse_mode: 'HTML',
        });
    }
}

async function processImageReferencesStep(
    ctx: BotContext,
    deps: AiHandlerDeps,
    session: BotSession,
    toolId: AiToolId,
    files: AiFileInput[],
    i18n: ReturnType<typeof getI18nForUser>,
) {
    const imageFiles = files.filter((file) =>
        file.mimeType.startsWith('image/'),
    );

    if (!imageFiles.length) {
        await ctx.reply(i18n.imageTool.needPhotoOnRefStep, {
            parse_mode: 'HTML',
        });
        return;
    }

    const message = ctx.message;
    const mediaGroupId =
        message && 'media_group_id' in message && message.media_group_id
            ? String(message.media_group_id)
            : undefined;

    if (mediaGroupId) {
        collectMediaGroupMessage({
            mediaGroupId,
            files: imageFiles,
            finalize: async (batch) => {
                await appendImageReferences(
                    ctx,
                    session,
                    toolId,
                    batch.files,
                    i18n,
                    deps,
                );
            },
            onError: async (error) => {
                const message =
                    error instanceof Error ? error.message : 'Unknown error';
                await ctx.reply(i18n.aiResult.error(message), {
                    parse_mode: 'HTML',
                });
            },
        });
        return;
    }

    await appendImageReferences(ctx, session, toolId, imageFiles, i18n, deps);
}

async function processImagePromptStep(
    ctx: BotContext,
    deps: AiHandlerDeps,
    session: BotSession,
    toolId: AiToolId,
    tool: NonNullable<ReturnType<typeof getToolById>>,
    text: string | undefined,
    files: AiFileInput[],
    i18n: ReturnType<typeof getI18nForUser>,
    user: NonNullable<
        Awaited<ReturnType<typeof deps.userModelService.getUserByTelegramId>>
    >,
) {
    if (files.length > 0) {
        await ctx.reply(i18n.imageTool.needPrompt, { parse_mode: 'HTML' });
        return;
    }

    if (!text?.trim()) {
        await ctx.reply(i18n.imageTool.needPrompt, { parse_mode: 'HTML' });
        return;
    }

    const referenceFiles = deserializeReferences(session.ai?.referenceFiles);
    const input = await buildAiGenerationInput(
        deps,
        session,
        toolId,
        text,
        referenceFiles,
        tool,
        i18n,
    );

    await runGeneration(
        ctx,
        deps,
        toolId,
        tool,
        input,
        session,
        text,
        i18n,
        user,
    );
}

async function appendImageReferences(
    ctx: BotContext,
    session: BotSession,
    toolId: AiToolId,
    files: AiFileInput[],
    i18n: ReturnType<typeof getI18nForUser>,
    deps: AiHandlerDeps,
) {
    if (!session.ai) {
        return;
    }

    if (!session.ai.referenceFiles) {
        session.ai.referenceFiles = [];
    }

    const imageFiles = files.filter((file) =>
        file.mimeType.startsWith('image/'),
    );
    if (!imageFiles.length) {
        await ctx.reply(i18n.imageTool.needPhotoOnRefStep, {
            parse_mode: 'HTML',
        });
        return;
    }

    let limitReached = false;
    for (const file of imageFiles) {
        if (session.ai.referenceFiles.length >= MAX_IMAGE_REFERENCES) {
            limitReached = true;
            break;
        }
        session.ai.referenceFiles.push(await serializeReference(file));
    }

    const count = session.ai.referenceFiles.length;
    if (limitReached) {
        await ctx.reply(i18n.imageTool.refLimitReached(MAX_IMAGE_REFERENCES), {
            parse_mode: 'HTML',
            ...generateImageEditorReplyKeyboard(i18n, {
                toolId,
                settings: session.ai.toolSettings ?? {},
                ...getImageToolCapabilities(
                    toolId,
                    deps.imageCapabilitiesService,
                ),
                step: session.ai.step ?? 'awaiting_image_references',
                keyboardMode: getImageKeyboardMode(session),
            }),
        });
    } else {
        await ctx.reply(i18n.imageTool.refAdded(count, MAX_IMAGE_REFERENCES), {
            parse_mode: 'HTML',
            ...generateImageEditorReplyKeyboard(i18n, {
                toolId,
                settings: session.ai.toolSettings ?? {},
                ...getImageToolCapabilities(
                    toolId,
                    deps.imageCapabilitiesService,
                ),
                step: session.ai.step ?? 'awaiting_image_references',
                keyboardMode: getImageKeyboardMode(session),
            }),
        });
    }
}

async function handleImageToolButtonPress(
    ctx: BotContext,
    deps: AiHandlerDeps,
    session: BotSession,
    toolId: AiToolId,
    text: string,
    i18n: ReturnType<typeof getI18nForUser>,
    user: NonNullable<
        Awaited<ReturnType<typeof deps.userModelService.getUserByTelegramId>>
    >,
): Promise<boolean> {
    if (!session.ai) {
        return false;
    }

    const caps = getImageToolCapabilities(
        toolId,
        deps.imageCapabilitiesService,
    );
    const keyboardMode = getImageKeyboardMode(session);
    const action = resolveImageToolButtonAction(text, i18n, {
        toolId,
        step: session.ai.step,
        keyboardMode,
        aspectRatios: caps.aspectRatios,
        resolutions: caps.resolutions,
        topazScales: caps.topazScales,
        currentSettings: session.ai.toolSettings ?? {},
    });

    if (!action) {
        return false;
    }

    const replyKeyboard = (
        mode: typeof keyboardMode,
        settings = session.ai!.toolSettings ?? {},
    ) =>
        generateImageEditorReplyKeyboard(i18n, {
            toolId,
            settings,
            ...caps,
            step: session.ai!.step,
            keyboardMode: mode,
        });

    if (action.type === 'open_settings') {
        session.ai.imageKeyboardMode = 'settings';
        const settings = session.ai.toolSettings ?? {};
        const parts = [i18n.imageTool.settingsMenuTitle];
        if (isImageToolWithAspectSettings(toolId) && caps.aspectRatios.length) {
            parts.push(
                i18n.imageTool.formatLine(
                    settings.aspectRatio ?? caps.aspectRatios[0],
                    caps.resolutions.length
                        ? (settings.resolution ?? caps.resolutions[0])
                        : undefined,
                ),
            );
        }
        await ctx.reply(parts.join('\n\n'), {
            ...replyKeyboard('settings'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'open_aspect_picker') {
        session.ai.imageKeyboardMode = 'aspect';
        await ctx.reply(i18n.imageTool.selectAspectRatioTitle, {
            ...replyKeyboard('aspect'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'open_resolution_picker') {
        session.ai.imageKeyboardMode = 'resolution';
        await ctx.reply(i18n.imageTool.selectResolutionTitle, {
            ...replyKeyboard('resolution'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'back_to_settings') {
        session.ai.imageKeyboardMode = 'settings';
        await ctx.reply(i18n.imageTool.settingsMenuTitle, {
            ...replyKeyboard('settings'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'back_to_editor') {
        session.ai.imageKeyboardMode = 'main';
        await ctx.reply(
            i18n.imageTool.keyboardUpdated(getToolLabel(toolId, user.language)),
            {
                ...replyKeyboard('main'),
            },
        );
        return true;
    }

    if (action.type === 'set_aspect') {
        const nextSettings =
            await deps.userAiToolSettingsModelService.upsertSettings(
                user.id,
                toolId,
                { aspectRatio: action.value },
            );
        session.ai.toolSettings = nextSettings;
        session.ai.imageKeyboardMode = 'aspect';
        await ctx.reply(i18n.imageTool.aspectRatioChanged(action.value), {
            ...replyKeyboard('aspect', nextSettings),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'set_resolution') {
        const nextSettings =
            await deps.userAiToolSettingsModelService.upsertSettings(
                user.id,
                toolId,
                { resolution: action.value },
            );
        session.ai.toolSettings = nextSettings;
        session.ai.imageKeyboardMode = 'resolution';
        await ctx.reply(i18n.imageTool.resolutionChanged(action.value), {
            ...replyKeyboard('resolution', nextSettings),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'set_topaz_scale') {
        const nextSettings =
            await deps.userAiToolSettingsModelService.upsertSettings(
                user.id,
                toolId,
                { topazScale: action.value },
            );
        session.ai.toolSettings = nextSettings;
        session.ai.imageKeyboardMode = 'settings';
        const tool = getToolById(toolId);
        const tokens = calculateTopazTokenCost(
            tool?.baseTokenCost ?? 40,
            action.value,
        );
        await ctx.reply(
            i18n.imageTool.topazScaleChanged(action.value, tokens),
            {
                ...replyKeyboard('settings', nextSettings),
                parse_mode: 'HTML',
            },
        );
        return true;
    }

    if (action.type === 'continue_prompt') {
        await goToImagePromptStep(
            ctx,
            session,
            toolId,
            i18n,
            deps.imageCapabilitiesService,
            user.language,
        );
        return true;
    }

    if (action.type === 'skip_refs') {
        session.ai.referenceFiles = [];
        await goToImagePromptStep(
            ctx,
            session,
            toolId,
            i18n,
            deps.imageCapabilitiesService,
            user.language,
        );
        return true;
    }

    return false;
}

async function processVideoReferencesStep(
    ctx: BotContext,
    deps: AiHandlerDeps,
    session: BotSession,
    toolId: AiToolId,
    files: AiFileInput[],
    i18n: ReturnType<typeof getI18nForUser>,
) {
    const imageFiles = files.filter((file) =>
        file.mimeType.startsWith('image/'),
    );

    if (!imageFiles.length) {
        await ctx.reply(i18n.videoTool.needPhotoOnRefStep, {
            parse_mode: 'HTML',
        });
        return;
    }

    const message = ctx.message;
    const mediaGroupId =
        message && 'media_group_id' in message && message.media_group_id
            ? String(message.media_group_id)
            : undefined;

    if (mediaGroupId) {
        collectMediaGroupMessage({
            mediaGroupId,
            files: imageFiles,
            finalize: async (batch) => {
                await appendVideoReferences(
                    ctx,
                    session,
                    toolId,
                    batch.files,
                    i18n,
                    deps,
                );
            },
            onError: async (error) => {
                const message =
                    error instanceof Error ? error.message : 'Unknown error';
                await ctx.reply(i18n.aiResult.error(message), {
                    parse_mode: 'HTML',
                });
            },
        });
        return;
    }

    await appendVideoReferences(ctx, session, toolId, imageFiles, i18n, deps);
}

async function processVideoPromptStep(
    ctx: BotContext,
    deps: AiHandlerDeps,
    session: BotSession,
    toolId: AiToolId,
    tool: NonNullable<ReturnType<typeof getToolById>>,
    text: string | undefined,
    files: AiFileInput[],
    i18n: ReturnType<typeof getI18nForUser>,
    user: NonNullable<
        Awaited<ReturnType<typeof deps.userModelService.getUserByTelegramId>>
    >,
) {
    if (files.length > 0) {
        await ctx.reply(i18n.videoTool.needPrompt, { parse_mode: 'HTML' });
        return;
    }

    if (!text?.trim()) {
        await ctx.reply(i18n.videoTool.needPrompt, { parse_mode: 'HTML' });
        return;
    }

    const referenceFiles = deserializeReferences(session.ai?.referenceFiles);
    const input = await buildAiGenerationInput(
        deps,
        session,
        toolId,
        text,
        referenceFiles,
        tool,
        i18n,
    );

    await runGeneration(
        ctx,
        deps,
        toolId,
        tool,
        input,
        session,
        text,
        i18n,
        user,
    );
}

async function appendVideoReferences(
    ctx: BotContext,
    session: BotSession,
    toolId: AiToolId,
    files: AiFileInput[],
    i18n: ReturnType<typeof getI18nForUser>,
    deps: AiHandlerDeps,
) {
    if (!session.ai) {
        return;
    }

    if (!session.ai.referenceFiles) {
        session.ai.referenceFiles = [];
    }

    const imageFiles = files.filter((file) =>
        file.mimeType.startsWith('image/'),
    );
    if (!imageFiles.length) {
        await ctx.reply(i18n.videoTool.needPhotoOnRefStep, {
            parse_mode: 'HTML',
        });
        return;
    }

    const maxRefs = getVideoMaxReferences(toolId);
    let limitReached = false;
    for (const file of imageFiles) {
        if (session.ai.referenceFiles.length >= maxRefs) {
            limitReached = true;
            break;
        }
        session.ai.referenceFiles.push(await serializeReference(file));
    }

    const count = session.ai.referenceFiles.length;
    const settings = (session.ai.toolSettings ?? {}) as VideoToolSettings;
    const caps = getVideoToolCapabilities(
        toolId,
        deps.videoCapabilitiesService,
        i18n.localeTag,
    );
    const keyboard = generateVideoEditorReplyKeyboard(i18n, {
        toolId,
        settings,
        aspectRatios: caps.aspectRatios,
        resolutions: caps.resolutions,
        durations: caps.durations,
        stylePresets: caps.stylePresets,
        step: session.ai.step ?? 'awaiting_video_references',
        keyboardMode: getVideoKeyboardMode(session),
        localeTag: i18n.localeTag,
    });

    if (limitReached) {
        await ctx.reply(i18n.videoTool.refLimitReached(maxRefs), {
            parse_mode: 'HTML',
            ...keyboard,
        });
    } else {
        await ctx.reply(i18n.videoTool.refAdded(count, maxRefs), {
            parse_mode: 'HTML',
            ...keyboard,
        });
    }
}

async function handleVideoToolButtonPress(
    ctx: BotContext,
    deps: AiHandlerDeps,
    session: BotSession,
    toolId: AiToolId,
    text: string,
    i18n: ReturnType<typeof getI18nForUser>,
    user: NonNullable<
        Awaited<ReturnType<typeof deps.userModelService.getUserByTelegramId>>
    >,
): Promise<boolean> {
    if (!session.ai) {
        return false;
    }

    const caps = getVideoToolCapabilities(
        toolId,
        deps.videoCapabilitiesService,
        i18n.localeTag,
    );
    const keyboardMode = getVideoKeyboardMode(session);
    const currentSettings = (session.ai.toolSettings ??
        {}) as VideoToolSettings;
    const action = resolveVideoToolButtonAction(text, i18n, {
        toolId,
        step: session.ai.step,
        keyboardMode,
        aspectRatios: caps.aspectRatios,
        resolutions: caps.resolutions,
        durations: caps.durations,
        stylePresets: caps.stylePresets,
        currentSettings,
        localeTag: i18n.localeTag,
    });

    if (!action) {
        return false;
    }

    const replyKeyboard = (
        mode: typeof keyboardMode,
        settings = (session.ai!.toolSettings ?? {}) as VideoToolSettings,
    ) =>
        generateVideoEditorReplyKeyboard(i18n, {
            toolId,
            settings,
            aspectRatios: caps.aspectRatios,
            resolutions: caps.resolutions,
            durations: caps.durations,
            stylePresets: caps.stylePresets,
            step: session.ai!.step,
            keyboardMode: mode,
            localeTag: i18n.localeTag,
        });

    if (action.type === 'open_settings') {
        session.ai.videoKeyboardMode = 'settings';
        const settings = (session.ai.toolSettings ?? {}) as VideoToolSettings;
        const parts = [i18n.videoTool.settingsMenuTitle];
        const summary = buildVideoSummaryLine(i18n, {
            settings,
            aspectRatios: caps.aspectRatios,
            resolutions: caps.resolutions,
            toolId,
            localeTag: i18n.localeTag,
            capabilitiesService: deps.videoCapabilitiesService,
        });
        if (summary) {
            parts.push(summary);
        }
        await ctx.reply(parts.join('\n\n'), {
            ...replyKeyboard('settings'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'open_aspect_picker') {
        session.ai.videoKeyboardMode = 'aspect';
        await ctx.reply(i18n.videoTool.selectAspectRatioTitle, {
            ...replyKeyboard('aspect'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'open_resolution_picker') {
        session.ai.videoKeyboardMode = 'resolution';
        await ctx.reply(i18n.videoTool.selectResolutionTitle, {
            ...replyKeyboard('resolution'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'open_duration_picker') {
        session.ai.videoKeyboardMode = 'duration';
        await ctx.reply(i18n.videoTool.selectDurationTitle, {
            ...replyKeyboard('duration'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'open_style_picker') {
        session.ai.videoKeyboardMode = 'style';
        await ctx.reply(i18n.videoTool.selectStyleTitle, {
            ...replyKeyboard('style'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'back_to_settings') {
        session.ai.videoKeyboardMode = 'settings';
        const settings = (session.ai.toolSettings ?? {}) as VideoToolSettings;
        const parts = [i18n.videoTool.settingsMenuTitle];
        const summary = buildVideoSummaryLine(i18n, {
            settings,
            aspectRatios: caps.aspectRatios,
            resolutions: caps.resolutions,
            toolId,
            localeTag: i18n.localeTag,
            capabilitiesService: deps.videoCapabilitiesService,
        });
        if (summary) {
            parts.push(summary);
        }
        await ctx.reply(parts.join('\n\n'), {
            ...replyKeyboard('settings'),
            parse_mode: 'HTML',
        });
        return true;
    }

    if (action.type === 'back_to_editor') {
        session.ai.videoKeyboardMode = 'main';
        await ctx.reply(
            i18n.videoTool.keyboardUpdated(getToolLabel(toolId, user.language)),
            {
                ...replyKeyboard('main'),
            },
        );
        return true;
    }

    if (action.type === 'set_aspect') {
        const nextSettings =
            await deps.userAiToolSettingsModelService.upsertVideoSettings(
                user.id,
                toolId,
                { aspectRatio: action.value },
            );
        session.ai.toolSettings = nextSettings;
        session.ai.videoKeyboardMode = 'settings';
        const summary = buildVideoSummaryLine(i18n, {
            settings: nextSettings,
            aspectRatios: caps.aspectRatios,
            resolutions: caps.resolutions,
            toolId,
            localeTag: i18n.localeTag,
            capabilitiesService: deps.videoCapabilitiesService,
        });
        await ctx.reply(
            [i18n.videoTool.aspectRatioChanged(action.value), summary]
                .filter(Boolean)
                .join('\n\n'),
            {
                ...replyKeyboard('settings', nextSettings),
                parse_mode: 'HTML',
            },
        );
        return true;
    }

    if (action.type === 'set_resolution') {
        const nextSettings =
            await deps.userAiToolSettingsModelService.upsertVideoSettings(
                user.id,
                toolId,
                { resolution: action.value },
            );
        session.ai.toolSettings = nextSettings;
        session.ai.videoKeyboardMode = 'settings';
        const summary = buildVideoSummaryLine(i18n, {
            settings: nextSettings,
            aspectRatios: caps.aspectRatios,
            resolutions: caps.resolutions,
            toolId,
            localeTag: i18n.localeTag,
            capabilitiesService: deps.videoCapabilitiesService,
        });
        await ctx.reply(
            [i18n.videoTool.resolutionChanged(action.value), summary]
                .filter(Boolean)
                .join('\n\n'),
            {
                ...replyKeyboard('settings', nextSettings),
                parse_mode: 'HTML',
            },
        );
        return true;
    }

    if (action.type === 'set_duration') {
        const nextSettings =
            await deps.userAiToolSettingsModelService.upsertVideoSettings(
                user.id,
                toolId,
                { durationSeconds: action.value },
            );
        session.ai.toolSettings = nextSettings;
        session.ai.videoKeyboardMode = 'settings';
        const tool = getToolById(toolId);
        const credits = tool
            ? calculateToolTokenCost(tool, { durationSeconds: action.value })
            : 0;
        const summary = buildVideoSummaryLine(i18n, {
            settings: nextSettings,
            aspectRatios: caps.aspectRatios,
            resolutions: caps.resolutions,
            toolId,
            localeTag: i18n.localeTag,
            capabilitiesService: deps.videoCapabilitiesService,
        });
        await ctx.reply(
            [i18n.videoTool.durationChanged(action.value, credits), summary]
                .filter(Boolean)
                .join('\n\n'),
            {
                ...replyKeyboard('settings', nextSettings),
                parse_mode: 'HTML',
            },
        );
        return true;
    }

    if (action.type === 'set_style') {
        const nextSettings =
            await deps.userAiToolSettingsModelService.upsertVideoSettings(
                user.id,
                toolId,
                { styleId: action.value },
            );
        session.ai.toolSettings = nextSettings;
        session.ai.videoKeyboardMode = 'settings';
        const styleLabel =
            caps.stylePresets.find((preset) => preset.id === action.value)
                ?.label ?? action.value;
        const summary = buildVideoSummaryLine(i18n, {
            settings: nextSettings,
            aspectRatios: caps.aspectRatios,
            resolutions: caps.resolutions,
            toolId,
            localeTag: i18n.localeTag,
            capabilitiesService: deps.videoCapabilitiesService,
        });
        await ctx.reply(
            [i18n.videoTool.styleChanged(styleLabel), summary]
                .filter(Boolean)
                .join('\n\n'),
            {
                ...replyKeyboard('settings', nextSettings),
                parse_mode: 'HTML',
            },
        );
        return true;
    }

    if (action.type === 'continue_prompt') {
        await goToVideoPromptStep(
            ctx,
            session,
            toolId,
            i18n,
            deps.videoCapabilitiesService,
            user.language,
            i18n.localeTag,
        );
        return true;
    }

    if (action.type === 'skip_refs') {
        session.ai.referenceFiles = [];
        await goToVideoPromptStep(
            ctx,
            session,
            toolId,
            i18n,
            deps.videoCapabilitiesService,
            user.language,
            i18n.localeTag,
        );
        return true;
    }

    return false;
}

async function processAiInput(ctx: BotContext, deps: AiHandlerDeps) {
    if (!ctx.from) return;

    const user = await deps.userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    if (!user) return;

    const i18n = getI18nForUser(user);

    const session = getSession(ctx);
    const toolId = session.ai?.activeToolId;
    if (!toolId) return;

    const tool = getToolById(toolId);
    if (!tool) return;

    const text = getMessageText(ctx);
    const files = await extractFilesFromMessage(ctx);

    if (
        text &&
        isImageFlowTool(toolId) &&
        (await handleImageToolButtonPress(
            ctx,
            deps,
            session,
            toolId,
            text,
            i18n,
            user,
        ))
    ) {
        return;
    }

    if (
        text &&
        isVideoFlowTool(toolId) &&
        (await handleVideoToolButtonPress(
            ctx,
            deps,
            session,
            toolId,
            text,
            i18n,
            user,
        ))
    ) {
        return;
    }

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
            user,
        );
        return;
    }

    const step = session.ai?.step ?? 'awaiting_input';

    if (step === 'awaiting_image_references') {
        await processImageReferencesStep(
            ctx,
            deps,
            session,
            toolId,
            files,
            i18n,
        );
        return;
    }

    if (step === 'awaiting_image_prompt') {
        await processImagePromptStep(
            ctx,
            deps,
            session,
            toolId,
            tool,
            text,
            files,
            i18n,
            user,
        );
        return;
    }

    if (step === 'awaiting_video_references') {
        await processVideoReferencesStep(
            ctx,
            deps,
            session,
            toolId,
            files,
            i18n,
        );
        return;
    }

    if (step === 'awaiting_video_prompt') {
        await processVideoPromptStep(
            ctx,
            deps,
            session,
            toolId,
            tool,
            text,
            files,
            i18n,
            user,
        );
        return;
    }

    if (isTopazTool(toolId)) {
        if (!files.length) {
            await ctx.reply(i18n.aiResult.sendTextOrFile);
            return;
        }

        const input = await buildAiGenerationInput(
            deps,
            session,
            toolId,
            undefined,
            files,
            tool,
            i18n,
        );

        await runGeneration(
            ctx,
            deps,
            toolId,
            tool,
            input,
            session,
            undefined,
            i18n,
            user,
        );
        return;
    }

    if (!text && files.length === 0) {
        await ctx.reply(i18n.aiResult.sendTextOrFile);
        return;
    }

    const message = ctx.message;
    const mediaGroupId =
        message && 'media_group_id' in message && message.media_group_id
            ? String(message.media_group_id)
            : undefined;

    if (mediaGroupId && files.length > 0) {
        collectMediaGroupMessage({
            mediaGroupId,
            files,
            prompt: text,
            finalize: async (batch) => {
                const batchInput = await buildAiGenerationInput(
                    deps,
                    session,
                    toolId,
                    batch.prompt,
                    batch.files,
                    tool,
                    i18n,
                );

                await runGeneration(
                    ctx,
                    deps,
                    toolId,
                    tool,
                    batchInput,
                    session,
                    batch.prompt,
                    i18n,
                    user,
                );
            },
            onError: async (error) => {
                const message =
                    error instanceof Error ? error.message : 'Unknown error';
                await ctx.reply(i18n.aiResult.error(message), {
                    parse_mode: 'HTML',
                });
            },
        });
        return;
    }

    const input = await buildAiGenerationInput(
        deps,
        session,
        toolId,
        text,
        files,
        tool,
        i18n,
    );

    await runGeneration(
        ctx,
        deps,
        toolId,
        tool,
        input,
        session,
        text,
        i18n,
        user,
    );
}

async function buildAiGenerationInput(
    deps: AiHandlerDeps,
    session: BotSession,
    toolId: AiToolId,
    text: string | undefined,
    files: AiFileInput[],
    tool: NonNullable<ReturnType<typeof getToolById>>,
    i18n: ReturnType<typeof getI18nForUser>,
): Promise<AiGenerationInput> {
    let chatHistory: AiGenerationInput['chatHistory'];

    if (toolId === AiToolId.GPT && session.ai?.activeConversationId) {
        chatHistory = await deps.gptConversationModelService.getMessages(
            session.ai.activeConversationId,
        );
    }

    const settings = session.ai?.toolSettings;
    const referenceCount = files.filter((file) =>
        file.mimeType.startsWith('image/'),
    ).length;
    let promptText = text?.trim() ?? '';

    if (isVideoFlowTool(toolId)) {
        const videoSettings = (settings ?? {}) as VideoToolSettings;
        const styleOption = deps.videoCapabilitiesService.resolveStyleOption(
            toolId,
            videoSettings.styleId,
        );
        if (styleOption.source === 'builtin' && styleOption.promptSuffix) {
            promptText = promptText
                ? `${promptText}. ${styleOption.promptSuffix}`
                : styleOption.promptSuffix;
        }
    }

    const prompt =
        referenceCount > 0
            ? buildNumberedReferencePrompt(
                  promptText ||
                      (i18n.localeTag === 'en-US'
                          ? 'Follow the reference images exactly'
                          : 'Строго следуй прикреплённым референсам'),
                  referenceCount,
                  i18n.localeTag,
              )
            : promptText || text;

    const videoSettings = isVideoFlowTool(toolId)
        ? ((settings ?? {}) as VideoToolSettings)
        : undefined;
    const imageSettings = isImageFlowTool(toolId)
        ? ((settings ?? {}) as ImageToolSettings)
        : undefined;
    const styleOption =
        videoSettings?.styleId && isVideoFlowTool(toolId)
            ? deps.videoCapabilitiesService.resolveStyleOption(
                  toolId,
                  videoSettings.styleId,
              )
            : undefined;

    return {
        prompt,
        files: files.length ? files : undefined,
        durationSeconds:
            videoSettings?.durationSeconds ?? tool.defaultDurationSeconds,
        chatHistory,
        gptWebSearch: session.ai?.gptWebSearch,
        gptReplyMode: session.ai?.gptReplyMode,
        localeTag: i18n.localeTag,
        aspectRatio: videoSettings?.aspectRatio ?? imageSettings?.aspectRatio,
        resolution: videoSettings?.resolution ?? imageSettings?.resolution,
        topazScale: imageSettings?.topazScale,
        videoStyleId: videoSettings?.styleId,
        videoStylePassthrough: styleOption?.passthrough,
    };
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
    user: NonNullable<
        Awaited<ReturnType<typeof deps.userModelService.getUserByTelegramId>>
    >,
) {
    if (!ctx.from) return;

    const tokenCost = deps.tokenBillingService.calculateCost(tool, {
        durationSeconds: input.durationSeconds ?? tool.defaultDurationSeconds,
        topazScale:
            input.topazScale ??
            (session.ai?.toolSettings as { topazScale?: number } | undefined)
                ?.topazScale,
    });

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

    try {
        if (tool.isAsync) {
            try {
                if (toolId === AiToolId.VIDEO_TO_AUDIO) {
                    await ctx.reply(i18n.aiResult.videoToAudioPreparing);
                } else {
                    await ctx.reply(i18n.aiResult.generating);
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
                        isSharpiiMidjourneyUpstreamError(message) ||
                        isSharpiiMidjourneyGenericFailure(message))
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

                    await sendGenerationResult(
                        ctx,
                        generationResult,
                        AiToolId.FLUX,
                    );
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

        await sendGenerationResult(ctx, generationResult, toolId);

        if (
            toolId === AiToolId.GPT &&
            generationResult.text &&
            session.ai?.activeConversationId
        ) {
            const storedFiles = input.files
                ? await Promise.all(
                      input.files.map((file) => compressReferenceImage(file)),
                  )
                : undefined;
            const userContent = serializeGptUserMessage(text, storedFiles);
            await deps.gptConversationModelService.appendMessages(
                session.ai.activeConversationId,
                userContent,
                generationResult.text,
            );

            if (text?.trim()) {
                await deps.gptConversationModelService.setTitleIfDefault(
                    session.ai.activeConversationId,
                    deps.gptConversationModelService.buildTitleFromPrompt(text),
                );
            }

            await deps.gptConversationModelService.trimOldConversations(
                user.id,
            );
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
    toolId: AiToolId,
) {
    if (result.type === 'text' && result.text) {
        await replyFormattedText(ctx, result.text);
        if (result.voiceBuffer) {
            await ctx.replyWithVoice(
                bufferToInputFile(result.voiceBuffer, 'voice.wav'),
            );
        }
        return;
    }

    if (result.type === 'audio' && result.buffer) {
        const ext = mimeTypeToExtension(result.mimeType ?? 'audio/mpeg', 'mp3');
        const inputFile = bufferToInputFile(result.buffer, `audio.${ext}`);
        if (toolId === AiToolId.SOUND_GENERATOR) {
            await ctx.replyWithAudio(inputFile);
        } else {
            await ctx.replyWithVoice(
                bufferToInputFile(result.buffer, `voice.${ext}`),
            );
        }
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

async function replyFormattedText(ctx: BotContext, text: string) {
    const html = markdownToTelegramHtml(text);

    try {
        await ctx.reply(html, { parse_mode: 'HTML' });
    } catch {
        await ctx.reply(text);
    }
}
