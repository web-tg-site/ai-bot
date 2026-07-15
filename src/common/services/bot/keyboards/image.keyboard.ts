import { Markup } from 'telegraf';
import { AiToolId } from '@/common/services/ai/types';
import { AiSessionStep } from '@/common/services/ai/types/ai-session-state.type';
import { I18nBundle } from '../i18n';
import { ImageToolSettings } from '@/common/types/image-tool-settings.type';
import { resolveImageSendAsFile } from '@/common/utils/resolve-send-as-file';
import {
    calculateTopazTokenCost,
    isImageToolWithAspectSettings,
    isTopazTool,
} from '@/common/config/image-editor-capabilities.config';
import { orderAspectRatios } from '@/common/config/aspect-ratio.config';
import { formatImageQualityLabel } from '@/common/config/image-editor-capabilities.config';
import {
    getToolById,
    calculateToolTokenCost,
} from '@/common/config/ai-tools.registry';
import { chunkKeyboardRow } from './keyboard-grid';

export type ImageKeyboardMode =
    | 'main'
    | 'settings'
    | 'aspect'
    | 'resolution'
    | 'quality';

function hasConfigurableSettings(
    toolId: AiToolId,
    aspectRatios: string[],
    resolutions: string[],
    qualities: string[],
): boolean {
    return (
        isTopazTool(toolId) ||
        (isImageToolWithAspectSettings(toolId) &&
            (aspectRatios.length > 0 ||
                resolutions.length > 0 ||
                qualities.length > 0)) ||
        true
    );
}

export function generateImageEditorReplyKeyboard(
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        settings: ImageToolSettings;
        aspectRatios: string[];
        resolutions: string[];
        qualities: string[];
        topazScales: readonly number[];
        step: AiSessionStep;
        keyboardMode: ImageKeyboardMode;
        localeTag: 'ru-RU' | 'en-US';
    },
) {
    if (options.keyboardMode === 'settings') {
        return generateSettingsMenuKeyboard(i18n, options);
    }

    if (options.keyboardMode === 'aspect') {
        return generateAspectRatioPickerKeyboard(
            i18n,
            options.aspectRatios,
            options.settings.aspectRatio ?? '1:1',
        );
    }

    if (options.keyboardMode === 'resolution') {
        return generateResolutionPickerKeyboard(
            i18n,
            options.toolId,
            options.resolutions,
            options.settings.resolution ?? options.resolutions[0] ?? '1K',
            options.settings.quality,
        );
    }

    if (options.keyboardMode === 'quality') {
        return generateQualityPickerKeyboard(
            i18n,
            options.toolId,
            options.qualities,
            options.settings.quality ?? options.qualities[0] ?? 'auto',
            options.settings.resolution,
            options.localeTag,
        );
    }

    const rows: string[][] = [];

    if (
        hasConfigurableSettings(
            options.toolId,
            options.aspectRatios,
            options.resolutions,
            options.qualities,
        )
    ) {
        rows.push([i18n.imageTool.settingsButton]);
    }

    if (options.step === 'awaiting_image_references') {
        rows.push([i18n.imageTool.continueToPrompt]);
        rows.push([i18n.imageTool.skipRefs]);
    }

    rows.push([i18n.buttons.back]);

    return Markup.keyboard(rows).resize();
}

function generateSettingsMenuKeyboard(
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        settings: ImageToolSettings;
        aspectRatios: string[];
        resolutions: string[];
        qualities: string[];
        topazScales: readonly number[];
    },
) {
    const rows: string[][] = [];

    if (isTopazTool(options.toolId)) {
        const tool = getToolById(options.toolId);
        const baseCost = tool?.baseTokenCost ?? 40;
        rows.push(
            ...chunkKeyboardRow(options.topazScales).map((chunk) =>
                chunk.map((scale) =>
                    i18n.imageTool.topazScaleButton(
                        scale,
                        calculateTopazTokenCost(baseCost, scale),
                        options.settings.topazScale === scale,
                    ),
                ),
            ),
        );
    } else {
        const settingButtons: string[] = [];
        if (options.aspectRatios.length) {
            settingButtons.push(i18n.imageTool.changeFormatButton);
        }
        if (options.resolutions.length) {
            settingButtons.push(i18n.imageTool.changeResolutionButton);
        }
        if (options.qualities.length) {
            settingButtons.push(i18n.imageTool.changeQualityButton);
        }
        rows.push(
            ...chunkKeyboardRow(settingButtons).map((chunk) => [...chunk]),
        );
    }

    rows.push([
        i18n.imageTool.sendAsFileButton(
            resolveImageSendAsFile(options.toolId, options.settings),
        ),
    ]);

    rows.push([i18n.imageTool.backToEditor]);
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
                ? i18n.imageTool.aspectRatioPickerSelected(ratio)
                : i18n.imageTool.aspectRatioPickerOption(ratio),
        ),
    );

    rows.push([i18n.imageTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}

function generateResolutionPickerKeyboard(
    i18n: I18nBundle,
    toolId: AiToolId,
    resolutions: string[],
    current: string,
    currentQuality?: string,
) {
    const tool = getToolById(toolId);
    const rows = chunkKeyboardRow(resolutions).map((chunk) =>
        chunk.map((resolution) => {
            const tokens = tool
                ? calculateToolTokenCost(tool, {
                      resolution,
                      quality: currentQuality,
                  })
                : 0;
            return resolution === current
                ? i18n.imageTool.resolutionPickerSelected(resolution, tokens)
                : i18n.imageTool.resolutionPickerOption(resolution, tokens);
        }),
    );

    rows.push([i18n.imageTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}

function generateQualityPickerKeyboard(
    i18n: I18nBundle,
    toolId: AiToolId,
    qualities: string[],
    current: string,
    currentResolution?: string,
    localeTag: 'ru-RU' | 'en-US' = 'ru-RU',
) {
    const tool = getToolById(toolId);
    const rows = chunkKeyboardRow(qualities).map((chunk) =>
        chunk.map((quality) => {
            const label = formatImageQualityLabel(quality, localeTag);
            const tokens = tool
                ? calculateToolTokenCost(tool, {
                      resolution: currentResolution,
                      quality,
                  })
                : 0;
            return quality === current
                ? i18n.imageTool.qualityPickerSelected(label, tokens)
                : i18n.imageTool.qualityPickerOption(label, tokens);
        }),
    );

    rows.push([i18n.imageTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}
