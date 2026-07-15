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
import { I18nBundle, getToolLabel, getToolInstruction } from '../i18n';
import { UserLanguage } from '@/generated/prisma/enums';
import { resolveVideoSendAsFile } from '@/common/utils/resolve-send-as-file';
import {
    generateVideoEditorReplyKeyboard,
    VideoKeyboardMode,
} from '../keyboards/video.keyboard';
import {
    buildVideoSummaryLine,
    getVideoToolCapabilities,
} from './video-tool-buttons';

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
        quality: capabilitiesService.normalizeQuality(toolId, stored.quality),
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

export function buildVideoToolMainScreenText(
    i18n: I18nBundle,
    toolId: AiToolId,
    language: UserLanguage | null | undefined,
    settings: VideoToolSettings,
    capabilitiesService: VideoCapabilitiesService,
): string {
    const label = getToolLabel(toolId, language);
    const instruction = getToolInstruction(toolId, language);
    const caps = getVideoToolCapabilities(
        toolId,
        capabilitiesService,
        i18n.localeTag,
    );
    const parts = [i18n.aiResult.toolSelected(label, instruction)];

    const summary = buildVideoSummaryLine(i18n, {
        settings,
        aspectRatios: caps.aspectRatios,
        resolutions: caps.resolutions,
        toolId,
        localeTag: i18n.localeTag,
        capabilitiesService,
    });
    if (summary) {
        parts.push(summary);
    }

    parts.push(
        i18n.videoTool.deliveryLine(resolveVideoSendAsFile(toolId, settings)),
    );

    return parts.join('\n\n');
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
        qualities: caps.qualities,
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
        buildVideoToolMainScreenText(
            i18n,
            toolId,
            language,
            session.ai?.toolSettings ?? {},
            capabilitiesService,
        ),
        {
            ...keyboard,
            parse_mode: 'HTML',
        },
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
