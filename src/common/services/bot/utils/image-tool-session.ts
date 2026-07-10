import { Context } from 'telegraf';
import { AiToolId, BotSession, AiSessionStep } from '@/common/services/ai';
import { AiToolCategory } from '@/common/services/ai/types';
import {
    isImageToolWithAspectSettings,
    isImageToolWithReferences,
    isTopazTool,
} from '@/common/config/image-editor-capabilities.config';
import { ImageCapabilitiesService } from '@/common/services/ai/image-capabilities.service';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import { ImageToolSettings } from '@/common/types/image-tool-settings.type';
import { I18nBundle, getToolLabel } from '../i18n';
import { UserLanguage } from '@/generated/prisma/enums';
import {
    generateImageEditorReplyKeyboard,
    ImageKeyboardMode,
} from '../keyboards/image.keyboard';

type BotContext = Context & { session: BotSession };

export async function loadImageToolSettings(
    userId: string,
    toolId: AiToolId,
    settingsService: UserAiToolSettingsModelService,
    capabilitiesService: ImageCapabilitiesService,
): Promise<ImageToolSettings> {
    const stored = await settingsService.getSettings(userId, toolId);
    return {
        aspectRatio: capabilitiesService.normalizeAspectRatio(
            toolId,
            stored.aspectRatio,
        ),
        resolution: capabilitiesService.normalizeResolution(
            toolId,
            stored.resolution,
        ),
        topazScale: capabilitiesService.normalizeTopazScale(stored.topazScale),
    };
}

export function getInitialImageToolStep(toolId: AiToolId): AiSessionStep {
    if (isTopazTool(toolId)) {
        return 'awaiting_input';
    }
    if (isImageToolWithReferences(toolId)) {
        return 'awaiting_image_references';
    }
    if (toolId === AiToolId.MIDJOURNEY) {
        return 'awaiting_image_prompt';
    }
    return 'awaiting_input';
}

export function getImageKeyboardMode(session: BotSession): ImageKeyboardMode {
    return session.ai?.imageKeyboardMode ?? 'main';
}

export function buildImageEditorReplyKeyboard(
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        language: UserLanguage | null | undefined;
        activeCategory?: AiToolCategory;
        settings: ImageToolSettings;
        step: AiSessionStep;
        capabilitiesService: ImageCapabilitiesService;
        keyboardMode?: ImageKeyboardMode;
    },
) {
    return generateImageEditorReplyKeyboard(i18n, {
        toolId: options.toolId,
        settings: options.settings,
        aspectRatios: options.capabilitiesService.getAspectRatios(
            options.toolId,
        ),
        resolutions: options.capabilitiesService.getResolutions(options.toolId),
        topazScales: options.capabilitiesService.getTopazScales(),
        step: options.step,
        keyboardMode: options.keyboardMode ?? 'main',
    });
}

export async function replyWithImageEditorKeyboard(
    ctx: BotContext,
    session: BotSession,
    toolId: AiToolId,
    i18n: I18nBundle,
    capabilitiesService: ImageCapabilitiesService,
    language: UserLanguage | null | undefined,
    options?: {
        text?: string;
        keyboardMode?: ImageKeyboardMode;
    },
) {
    if (
        !isImageToolWithAspectSettings(toolId) &&
        !isTopazTool(toolId) &&
        !isImageToolWithReferences(toolId) &&
        toolId !== AiToolId.MIDJOURNEY
    ) {
        return;
    }

    const keyboard = buildImageEditorReplyKeyboard(i18n, {
        toolId,
        language,
        activeCategory: session.ai?.activeCategory,
        settings: session.ai?.toolSettings ?? {},
        step: session.ai?.step ?? 'awaiting_input',
        capabilitiesService,
        keyboardMode: options?.keyboardMode ?? getImageKeyboardMode(session),
    });

    if (options?.text) {
        await ctx.reply(options.text, {
            ...keyboard,
            parse_mode: 'HTML',
        });
        return;
    }

    await ctx.reply(
        i18n.imageTool.keyboardUpdated(getToolLabel(toolId, language)),
        keyboard,
    );
}

export async function goToImagePromptStep(
    ctx: BotContext,
    session: BotSession,
    toolId: AiToolId,
    i18n: I18nBundle,
    capabilitiesService: ImageCapabilitiesService,
    language: UserLanguage | null | undefined,
) {
    if (!session.ai) {
        return;
    }

    session.ai.step = 'awaiting_image_prompt';
    session.ai.imageKeyboardMode = 'main';

    await replyWithImageEditorKeyboard(
        ctx,
        session,
        toolId,
        i18n,
        capabilitiesService,
        language,
        { text: i18n.imageTool.promptHint },
    );
}
