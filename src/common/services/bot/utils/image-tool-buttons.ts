import { AiToolId } from '@/common/services/ai/types';
import { AiSessionStep } from '@/common/services/ai/types/ai-session-state.type';
import { ImageCapabilitiesService } from '@/common/services/ai/image-capabilities.service';
import {
    calculateTopazTokenCost,
    formatImageQualityLabel,
    isImageToolWithAspectSettings,
    isTopazTool,
} from '@/common/config/image-editor-capabilities.config';
import {
    getToolById,
    calculateToolTokenCost,
} from '@/common/config/ai-tools.registry';
import { I18nBundle, ru, en } from '../i18n';
import { ImageKeyboardMode } from '../keyboards/image.keyboard';
import { resolveImageSendAsFile } from '@/common/utils/resolve-send-as-file';

export type ImageToolButtonAction =
    | { type: 'open_settings' }
    | { type: 'open_aspect_picker' }
    | { type: 'open_resolution_picker' }
    | { type: 'open_quality_picker' }
    | { type: 'set_aspect'; value: string }
    | { type: 'set_resolution'; value: string }
    | { type: 'set_quality'; value: string }
    | { type: 'set_topaz_scale'; value: number }
    | { type: 'toggle_send_as_file' }
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
        qualities: string[];
        topazScales: readonly number[];
        currentSettings: {
            aspectRatio?: string;
            resolution?: string;
            quality?: string;
            topazScale?: number;
            sendAsFile?: boolean;
        };
        localeTag: 'ru-RU' | 'en-US';
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
        const tool = getToolById(options.toolId);
        for (const resolution of options.resolutions) {
            const tokens = tool
                ? calculateToolTokenCost(tool, {
                      resolution,
                      quality: options.currentSettings.quality,
                  })
                : 0;
            if (
                text ===
                    i18n.imageTool.resolutionPickerOption(resolution, tokens) ||
                text ===
                    i18n.imageTool.resolutionPickerSelected(resolution, tokens)
            ) {
                return { type: 'set_resolution', value: resolution };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'quality') {
        const tool = getToolById(options.toolId);
        for (const quality of options.qualities) {
            const label = formatImageQualityLabel(quality, options.localeTag);
            const tokens = tool
                ? calculateToolTokenCost(tool, {
                      resolution: options.currentSettings.resolution,
                      quality,
                  })
                : 0;
            if (
                text === i18n.imageTool.qualityPickerOption(label, tokens) ||
                text === i18n.imageTool.qualityPickerSelected(label, tokens)
            ) {
                return { type: 'set_quality', value: quality };
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

        if (
            options.qualities.length &&
            text === i18n.imageTool.changeQualityButton
        ) {
            return { type: 'open_quality_picker' };
        }

        if (
            text ===
                i18n.imageTool.sendAsFileButton(
                    resolveImageSendAsFile(
                        options.toolId,
                        options.currentSettings,
                    ),
                ) ||
            text ===
                i18n.imageTool.sendAsFileButton(
                    !resolveImageSendAsFile(
                        options.toolId,
                        options.currentSettings,
                    ),
                )
        ) {
            return { type: 'toggle_send_as_file' };
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
            text === i18n.imageTool.changeResolutionButton ||
            text === i18n.imageTool.changeQualityButton
        ) {
            return true;
        }

        if (
            text === i18n.imageTool.sendAsFileButton(true) ||
            text === i18n.imageTool.sendAsFileButton(false)
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

        if (text.includes(' ток.') || text.includes(' tok.')) {
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
        qualities: capabilitiesService.getQualities(toolId),
        topazScales: capabilitiesService.getTopazScales(),
    };
}
