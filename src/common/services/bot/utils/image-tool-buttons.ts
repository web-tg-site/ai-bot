import { AiToolId } from '@/common/services/ai/types';
import { AiSessionStep } from '@/common/services/ai/types/ai-session-state.type';
import { ImageCapabilitiesService } from '@/common/services/ai/image-capabilities.service';
import {
    calculateTopazTokenCost,
    isImageToolWithAspectSettings,
    isTopazTool,
} from '@/common/config/image-editor-capabilities.config';
import { getToolById } from '@/common/config/ai-tools.registry';
import { I18nBundle, ru, en } from '../i18n';
import { ImageKeyboardMode } from '../keyboards/image.keyboard';

export type ImageToolButtonAction =
    | { type: 'open_settings' }
    | { type: 'open_aspect_picker' }
    | { type: 'open_resolution_picker' }
    | { type: 'set_aspect'; value: string }
    | { type: 'set_resolution'; value: string }
    | { type: 'set_topaz_scale'; value: number }
    | { type: 'continue_prompt' }
    | { type: 'skip_refs' }
    | { type: 'back_to_settings' }
    | { type: 'back_to_editor' };

export function resolveImageToolButtonAction(
    text: string,
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        step: AiSessionStep;
        keyboardMode: ImageKeyboardMode;
        aspectRatios: string[];
        resolutions: string[];
        topazScales: readonly number[];
        currentSettings: {
            aspectRatio?: string;
            resolution?: string;
            topazScale?: number;
        };
    },
): ImageToolButtonAction | null {
    if (
        text === i18n.imageTool.continueToPrompt &&
        options.step === 'awaiting_image_references'
    ) {
        return { type: 'continue_prompt' };
    }

    if (
        text === i18n.imageTool.skipRefs &&
        options.step === 'awaiting_image_references'
    ) {
        return { type: 'skip_refs' };
    }

    if (text === i18n.imageTool.backToEditor) {
        return { type: 'back_to_editor' };
    }

    if (text === i18n.imageTool.backToSettings) {
        return { type: 'back_to_settings' };
    }

    if (options.keyboardMode === 'aspect') {
        for (const ratio of options.aspectRatios) {
            if (
                text === i18n.imageTool.aspectRatioPickerOption(ratio) ||
                text === i18n.imageTool.aspectRatioPickerSelected(ratio)
            ) {
                return { type: 'set_aspect', value: ratio };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'resolution') {
        for (const resolution of options.resolutions) {
            if (
                text === i18n.imageTool.resolutionPickerOption(resolution) ||
                text === i18n.imageTool.resolutionPickerSelected(resolution)
            ) {
                return { type: 'set_resolution', value: resolution };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'settings') {
        if (isTopazTool(options.toolId)) {
            const tool = getToolById(options.toolId);
            const baseCost = tool?.baseTokenCost ?? 40;
            for (const scale of options.topazScales) {
                const selected = options.currentSettings.topazScale === scale;
                if (
                    text ===
                        i18n.imageTool.topazScaleButton(
                            scale,
                            calculateTopazTokenCost(baseCost, scale),
                            selected,
                        ) ||
                    text ===
                        i18n.imageTool.topazScaleButton(
                            scale,
                            calculateTopazTokenCost(baseCost, scale),
                            !selected,
                        )
                ) {
                    return { type: 'set_topaz_scale', value: scale };
                }
            }
        }

        if (
            isImageToolWithAspectSettings(options.toolId) &&
            options.aspectRatios.length &&
            text === i18n.imageTool.changeFormatButton
        ) {
            return { type: 'open_aspect_picker' };
        }

        if (
            options.resolutions.length &&
            text === i18n.imageTool.changeResolutionButton
        ) {
            return { type: 'open_resolution_picker' };
        }

        return null;
    }

    if (text === i18n.imageTool.settingsButton) {
        return { type: 'open_settings' };
    }

    return null;
}

export function isImageToolControlButton(text: string | undefined): boolean {
    if (!text) {
        return false;
    }

    for (const i18n of [ru, en]) {
        if (
            text === i18n.imageTool.continueToPrompt ||
            text === i18n.imageTool.skipRefs ||
            text === i18n.imageTool.backToEditor ||
            text === i18n.imageTool.backToSettings ||
            text === i18n.imageTool.settingsButton ||
            text === i18n.imageTool.changeFormatButton ||
            text === i18n.imageTool.changeResolutionButton
        ) {
            return true;
        }

        if (text.startsWith('📐 ') || text.startsWith('🖼 ')) {
            return true;
        }

        if (text.startsWith('×') && text.includes('ток')) {
            return true;
        }
        if (text.startsWith('×') && text.includes('tok')) {
            return true;
        }

        if (text.startsWith('✓ ')) {
            return true;
        }
    }

    return false;
}

export function getImageToolCapabilities(
    toolId: AiToolId,
    capabilitiesService: ImageCapabilitiesService,
) {
    return {
        aspectRatios: capabilitiesService.getAspectRatios(toolId),
        resolutions: capabilitiesService.getResolutions(toolId),
        topazScales: capabilitiesService.getTopazScales(),
    };
}
