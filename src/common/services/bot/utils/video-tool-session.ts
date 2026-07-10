import { Context } from 'telegraf';
import { AiToolId, BotSession, AiSessionStep } from '@/common/services/ai';
import { AiToolCategory } from '@/common/services/ai/types';
import {
    isVideoFlowTool,
    isVideoToolWithReferences,
} from '@/common/config/video-editor-capabilities.config';
import { VideoCapabilitiesService } from '@/common/services/ai/video-capabilities.service';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { I18nBundle, getToolLabel } from '../i18n';
import { UserLanguage } from '@/generated/prisma/enums';
import {
    generateVideoEditorReplyKeyboard,
    VideoKeyboardMode,
} from '../keyboards/video.keyboard';
import { getVideoToolCapabilities } from './video-tool-buttons';

type BotContext = Context & { session: BotSession };

export async function loadVideoToolSettings(
    userId: string,
    toolId: AiToolId,
    settingsService: UserAiToolSettingsModelService,
    capabilitiesService: VideoCapabilitiesService,
): Promise<VideoToolSettings> {
    const stored = await settingsService.getVideoSettings(userId, toolId);
    return {
        aspectRatio: capabilitiesService.normalizeAspectRatio(
            toolId,
            stored.aspectRatio,
        ),
        resolution: capabilitiesService.normalizeResolution(
            toolId,
            stored.resolution,
        ),
        durationSeconds: capabilitiesService.normalizeDuration(
            toolId,
            stored.durationSeconds,
        ),
        styleId: capabilitiesService.normalizeStyleId(toolId, stored.styleId),
    };
}

export function getInitialVideoToolStep(toolId: AiToolId): AiSessionStep {
    if (isVideoToolWithReferences(toolId)) {
        return 'awaiting_video_references';
    }
    return 'awaiting_video_prompt';
}

export function getVideoKeyboardMode(session: BotSession): VideoKeyboardMode {
    return session.ai?.videoKeyboardMode ?? 'main';
}

export function buildVideoEditorReplyKeyboard(
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        language: UserLanguage | null | undefined;
        activeCategory?: AiToolCategory;
        settings: VideoToolSettings;
        step: AiSessionStep;
        capabilitiesService: VideoCapabilitiesService;
        keyboardMode?: VideoKeyboardMode;
        localeTag: 'ru-RU' | 'en-US';
    },
) {
    const caps = getVideoToolCapabilities(
        options.toolId,
        options.capabilitiesService,
        options.localeTag,
    );

    return generateVideoEditorReplyKeyboard(i18n, {
        toolId: options.toolId,
        settings: options.settings,
        aspectRatios: caps.aspectRatios,
        resolutions: caps.resolutions,
        durations: caps.durations,
        stylePresets: caps.stylePresets,
        step: options.step,
        keyboardMode: options.keyboardMode ?? 'main',
        localeTag: options.localeTag,
    });
}

export async function replyWithVideoEditorKeyboard(
    ctx: BotContext,
    session: BotSession,
    toolId: AiToolId,
    i18n: I18nBundle,
    capabilitiesService: VideoCapabilitiesService,
    language: UserLanguage | null | undefined,
    localeTag: 'ru-RU' | 'en-US',
    options?: {
        text?: string;
        keyboardMode?: VideoKeyboardMode;
    },
) {
    if (!isVideoFlowTool(toolId)) {
        return;
    }

    const keyboard = buildVideoEditorReplyKeyboard(i18n, {
        toolId,
        language,
        activeCategory: session.ai?.activeCategory,
        settings: session.ai?.toolSettings ?? {},
        step: session.ai?.step ?? 'awaiting_input',
        capabilitiesService,
        keyboardMode: options?.keyboardMode ?? getVideoKeyboardMode(session),
        localeTag,
    });

    if (options?.text) {
        await ctx.reply(options.text, {
            ...keyboard,
            parse_mode: 'HTML',
        });
        return;
    }

    await ctx.reply(
        i18n.videoTool.keyboardUpdated(getToolLabel(toolId, language)),
        keyboard,
    );
}

export async function goToVideoPromptStep(
    ctx: BotContext,
    session: BotSession,
    toolId: AiToolId,
    i18n: I18nBundle,
    capabilitiesService: VideoCapabilitiesService,
    language: UserLanguage | null | undefined,
    localeTag: 'ru-RU' | 'en-US',
) {
    if (!session.ai) {
        return;
    }

    session.ai.step = 'awaiting_video_prompt';
    session.ai.videoKeyboardMode = 'main';

    await replyWithVideoEditorKeyboard(
        ctx,
        session,
        toolId,
        i18n,
        capabilitiesService,
        language,
        localeTag,
        { text: i18n.videoTool.promptHint },
    );
}
