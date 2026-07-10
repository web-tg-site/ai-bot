import { Markup } from 'telegraf';
import { AiToolId } from '@/common/services/ai/types';
import { AiSessionStep } from '@/common/services/ai/types/ai-session-state.type';
import { I18nBundle } from '../i18n';
import { ImageToolSettings } from '@/common/types/image-tool-settings.type';
import {
    calculateTopazTokenCost,
    isImageToolWithAspectSettings,
    isTopazTool,
} from '@/common/config/image-editor-capabilities.config';
import { orderAspectRatios } from '@/common/config/aspect-ratio.config';
import { getToolById } from '@/common/config/ai-tools.registry';
import { chunkKeyboardRow } from './keyboard-grid';

export type ImageKeyboardMode = 'main' | 'settings' | 'aspect' | 'resolution';

function hasConfigurableSettings(
    toolId: AiToolId,
    aspectRatios: string[],
    resolutions: string[],
): boolean {
    return (
        isTopazTool(toolId) ||
        (isImageToolWithAspectSettings(toolId) &&
            (aspectRatios.length > 0 || resolutions.length > 0))
    );
}

export function generateImageEditorReplyKeyboard(
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        settings: ImageToolSettings;
        aspectRatios: string[];
        resolutions: string[];
        topazScales: readonly number[];
        step: AiSessionStep;
        keyboardMode: ImageKeyboardMode;
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
            options.resolutions,
            options.settings.resolution ?? options.resolutions[0] ?? '1K',
        );
    }

    const rows: string[][] = [];

    if (
        hasConfigurableSettings(
            options.toolId,
            options.aspectRatios,
            options.resolutions,
        )
    ) {
        rows.push([i18n.imageTool.settingsButton]);
    }

    if (options.step === 'awaiting_image_references') {
        rows.push([i18n.imageTool.continueToPrompt, i18n.imageTool.skipRefs]);
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
        rows.push(
            ...chunkKeyboardRow(settingButtons).map((chunk) => [...chunk]),
        );
    }

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
    resolutions: string[],
    current: string,
) {
    const rows = chunkKeyboardRow(resolutions).map((chunk) =>
        chunk.map((resolution) =>
            resolution === current
                ? i18n.imageTool.resolutionPickerSelected(resolution)
                : i18n.imageTool.resolutionPickerOption(resolution),
        ),
    );

    rows.push([i18n.imageTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}
