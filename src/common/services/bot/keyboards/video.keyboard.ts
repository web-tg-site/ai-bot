import { Markup } from 'telegraf';
import { AiToolId } from '@/common/services/ai/types';
import { AiSessionStep } from '@/common/services/ai/types/ai-session-state.type';
import { I18nBundle } from '../i18n';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import {
    isVideoToolWithAspectSettings,
    isVideoToolWithReferences,
} from '@/common/config/video-editor-capabilities.config';
import { orderAspectRatios } from '@/common/config/aspect-ratio.config';
import {
    AiToolConfig,
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';
import { chunkKeyboardRow } from './keyboard-grid';

export type VideoKeyboardMode =
    | 'main'
    | 'settings'
    | 'aspect'
    | 'resolution'
    | 'duration'
    | 'style';

type VideoStyleOption = {
    id: string;
    label: string;
};

function hasConfigurableSettings(options: {
    toolId: AiToolId;
    aspectRatios: string[];
    resolutions: string[];
    durations: number[];
}): boolean {
    return (
        (isVideoToolWithAspectSettings(options.toolId) &&
            (options.aspectRatios.length > 0 ||
                options.resolutions.length > 0)) ||
        options.durations.length > 0
    );
}

export function generateVideoEditorReplyKeyboard(
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        settings: VideoToolSettings;
        aspectRatios: string[];
        resolutions: string[];
        durations: number[];
        stylePresets: VideoStyleOption[];
        step: AiSessionStep;
        keyboardMode: VideoKeyboardMode;
        localeTag: 'ru-RU' | 'en-US';
    },
) {
    const tool = getToolById(options.toolId);

    if (options.keyboardMode === 'settings') {
        return generateSettingsMenuKeyboard(i18n, tool, options);
    }

    if (options.keyboardMode === 'aspect') {
        return generateAspectRatioPickerKeyboard(
            i18n,
            options.aspectRatios,
            options.settings.aspectRatio ?? options.aspectRatios[0] ?? '16:9',
        );
    }

    if (options.keyboardMode === 'resolution') {
        return generateResolutionPickerKeyboard(
            i18n,
            options.resolutions,
            options.settings.resolution ?? options.resolutions[0] ?? '720p',
        );
    }

    if (options.keyboardMode === 'duration') {
        return generateDurationPickerKeyboard(i18n, tool, options);
    }

    if (options.keyboardMode === 'style') {
        return generateStylePickerKeyboard(
            i18n,
            options.stylePresets,
            options.settings.styleId ?? 'none',
        );
    }

    const rows: string[][] = [];

    if (
        hasConfigurableSettings({
            toolId: options.toolId,
            aspectRatios: options.aspectRatios,
            resolutions: options.resolutions,
            durations: options.durations,
        })
    ) {
        rows.push([i18n.videoTool.settingsButton]);
    }

    if (
        options.step === 'awaiting_video_references' &&
        isVideoToolWithReferences(options.toolId)
    ) {
        rows.push([i18n.videoTool.continueToPrompt, i18n.videoTool.skipRefs]);
    }

    rows.push([i18n.buttons.back]);

    return Markup.keyboard(rows).resize();
}

function generateSettingsMenuKeyboard(
    i18n: I18nBundle,
    _tool: AiToolConfig | undefined,
    options: {
        toolId: AiToolId;
        settings: VideoToolSettings;
        aspectRatios: string[];
        resolutions: string[];
        durations: number[];
        stylePresets: VideoStyleOption[];
    },
) {
    const settingButtons: string[] = [];

    if (
        isVideoToolWithAspectSettings(options.toolId) &&
        options.aspectRatios.length
    ) {
        settingButtons.push(i18n.videoTool.changeFormatButton);
    }

    if (options.resolutions.length) {
        settingButtons.push(i18n.videoTool.changeResolutionButton);
    }

    if (options.durations.length) {
        settingButtons.push(i18n.videoTool.changeDurationButton);
    }

    if (options.stylePresets.length) {
        settingButtons.push(i18n.videoTool.changeStyleButton);
    }

    const rows = chunkKeyboardRow(settingButtons).map((chunk) => [...chunk]);
    rows.push([i18n.videoTool.backToEditor]);
    return Markup.keyboard(rows).resize();
}

function generateAspectRatioPickerKeyboard(
    i18n: I18nBundle,
    aspectRatios: string[],
    current: string,
) {
    const ordered = orderAspectRatios(aspectRatios);
    const rows = chunkKeyboardRow(ordered).map((chunk) =>
        chunk.map((ratio) =>
            ratio === current
                ? i18n.videoTool.aspectRatioPickerSelected(ratio)
                : i18n.videoTool.aspectRatioPickerOption(ratio),
        ),
    );

    rows.push([i18n.videoTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}

function generateResolutionPickerKeyboard(
    i18n: I18nBundle,
    resolutions: string[],
    current: string,
) {
    const rows = chunkKeyboardRow(resolutions).map((chunk) =>
        chunk.map((resolution) =>
            resolution === current
                ? i18n.videoTool.resolutionPickerSelected(resolution)
                : i18n.videoTool.resolutionPickerOption(resolution),
        ),
    );

    rows.push([i18n.videoTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}

function generateDurationPickerKeyboard(
    i18n: I18nBundle,
    tool: AiToolConfig | undefined,
    options: {
        settings: VideoToolSettings;
        durations: number[];
    },
) {
    const current = options.settings.durationSeconds ?? options.durations[0];
    const rows = chunkKeyboardRow(options.durations).map((chunk) =>
        chunk.map((seconds) => {
            const credits = tool
                ? calculateToolTokenCost(tool, { durationSeconds: seconds })
                : 0;
            return seconds === current
                ? i18n.videoTool.durationPickerSelected(seconds, credits)
                : i18n.videoTool.durationPickerOption(seconds, credits);
        }),
    );

    rows.push([i18n.videoTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}

function generateStylePickerKeyboard(
    i18n: I18nBundle,
    stylePresets: VideoStyleOption[],
    currentStyleId: string,
) {
    const rows = chunkKeyboardRow(stylePresets).map((chunk) =>
        chunk.map((preset) =>
            preset.id === currentStyleId
                ? i18n.videoTool.stylePickerSelected(preset.label)
                : i18n.videoTool.stylePickerOption(preset.label),
        ),
    );

    rows.push([i18n.videoTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}
