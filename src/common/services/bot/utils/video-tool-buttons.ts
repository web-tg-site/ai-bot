import { AiToolId } from '@/common/services/ai/types';
import { AiSessionStep } from '@/common/services/ai/types/ai-session-state.type';
import { VideoCapabilitiesService } from '@/common/services/ai/video-capabilities.service';
import {
    getVideoQualityLabel,
    getVideoStyleLabel,
    isVideoToolWithAspectSettings,
} from '@/common/config/video-editor-capabilities.config';
import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';
import { I18nBundle, ru, en } from '../i18n';
import { VideoKeyboardMode } from '../keyboards/video.keyboard';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { resolveVideoSendAsFile } from '@/common/utils/resolve-send-as-file';

export type VideoToolButtonAction =
    | { type: 'open_settings' }
    | { type: 'open_aspect_picker' }
    | { type: 'open_resolution_picker' }
    | { type: 'open_quality_picker' }
    | { type: 'open_duration_picker' }
    | { type: 'open_style_picker' }
    | { type: 'set_aspect'; value: string }
    | { type: 'set_resolution'; value: string }
    | { type: 'set_quality'; value: string }
    | { type: 'set_duration'; value: number }
    | { type: 'set_style'; value: string }
    | { type: 'toggle_send_as_file' }
    | { type: 'continue_prompt' }
    | { type: 'skip_refs' }
    | { type: 'back_to_settings' }
    | { type: 'back_to_editor' };

export function resolveVideoToolButtonAction(
    text: string,
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        step: AiSessionStep;
        keyboardMode: VideoKeyboardMode;
        aspectRatios: string[];
        resolutions: string[];
        qualities: Array<{ value: string; label: string }>;
        durations: number[];
        stylePresets: Array<{ id: string; label: string }>;
        currentSettings: VideoToolSettings;
        localeTag: 'ru-RU' | 'en-US';
    },
): VideoToolButtonAction | null {
    if (
        text === i18n.videoTool.continueToPrompt &&
        options.step === 'awaiting_video_references'
    ) {
        return { type: 'continue_prompt' };
    }

    if (
        text === i18n.videoTool.skipRefs &&
        options.step === 'awaiting_video_references'
    ) {
        return { type: 'skip_refs' };
    }

    if (text === i18n.videoTool.backToEditor) {
        return { type: 'back_to_editor' };
    }

    if (text === i18n.videoTool.backToSettings) {
        return { type: 'back_to_settings' };
    }

    if (options.keyboardMode === 'aspect') {
        for (const ratio of options.aspectRatios) {
            if (
                text === i18n.videoTool.aspectRatioPickerOption(ratio) ||
                text === i18n.videoTool.aspectRatioPickerSelected(ratio)
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
                      durationSeconds:
                          options.currentSettings.durationSeconds ??
                          tool.defaultDurationSeconds,
                      resolution,
                      quality: options.currentSettings.quality,
                  })
                : 0;
            if (
                text ===
                    i18n.videoTool.resolutionPickerOption(resolution, tokens) ||
                text ===
                    i18n.videoTool.resolutionPickerSelected(resolution, tokens)
            ) {
                return { type: 'set_resolution', value: resolution };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'quality') {
        const tool = getToolById(options.toolId);
        for (const option of options.qualities) {
            const tokens = tool
                ? calculateToolTokenCost(tool, {
                      durationSeconds:
                          options.currentSettings.durationSeconds ??
                          tool.defaultDurationSeconds,
                      resolution: options.currentSettings.resolution,
                      quality: option.value,
                  })
                : 0;
            if (
                text ===
                    i18n.videoTool.qualityPickerOption(option.label, tokens) ||
                text ===
                    i18n.videoTool.qualityPickerSelected(option.label, tokens)
            ) {
                return { type: 'set_quality', value: option.value };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'duration') {
        const tool = getToolById(options.toolId);
        for (const seconds of options.durations) {
            const credits = tool
                ? calculateToolTokenCost(tool, {
                      durationSeconds: seconds,
                      resolution: options.currentSettings.resolution,
                      quality: options.currentSettings.quality,
                  })
                : 0;
            if (
                text ===
                    i18n.videoTool.durationPickerOption(seconds, credits) ||
                text === i18n.videoTool.durationPickerSelected(seconds, credits)
            ) {
                return { type: 'set_duration', value: seconds };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'style') {
        for (const preset of options.stylePresets) {
            if (
                text === i18n.videoTool.stylePickerOption(preset.label) ||
                text === i18n.videoTool.stylePickerSelected(preset.label)
            ) {
                return { type: 'set_style', value: preset.id };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'settings') {
        if (
            isVideoToolWithAspectSettings(options.toolId) &&
            options.aspectRatios.length &&
            text === i18n.videoTool.changeFormatButton
        ) {
            return { type: 'open_aspect_picker' };
        }

        if (
            options.resolutions.length &&
            text === i18n.videoTool.changeResolutionButton
        ) {
            return { type: 'open_resolution_picker' };
        }

        if (
            options.qualities.length &&
            text === i18n.videoTool.changeQualityButton
        ) {
            return { type: 'open_quality_picker' };
        }

        if (
            options.durations.length &&
            text === i18n.videoTool.changeDurationButton
        ) {
            return { type: 'open_duration_picker' };
        }

        if (
            options.stylePresets.length &&
            text === i18n.videoTool.changeStyleButton
        ) {
            return { type: 'open_style_picker' };
        }

        if (
            text ===
                i18n.videoTool.sendAsFileButton(
                    resolveVideoSendAsFile(
                        options.toolId,
                        options.currentSettings,
                    ),
                ) ||
            text ===
                i18n.videoTool.sendAsFileButton(
                    !resolveVideoSendAsFile(
                        options.toolId,
                        options.currentSettings,
                    ),
                )
        ) {
            return { type: 'toggle_send_as_file' };
        }

        return null;
    }

    if (text === i18n.videoTool.settingsButton) {
        return { type: 'open_settings' };
    }

    return null;
}

export function isVideoToolControlButton(text: string | undefined): boolean {
    if (!text) {
        return false;
    }

    for (const i18n of [ru, en]) {
        if (
            text === i18n.videoTool.continueToPrompt ||
            text === i18n.videoTool.skipRefs ||
            text === i18n.videoTool.backToEditor ||
            text === i18n.videoTool.backToSettings ||
            text === i18n.videoTool.settingsButton ||
            text === i18n.videoTool.changeFormatButton ||
            text === i18n.videoTool.changeResolutionButton ||
            text === i18n.videoTool.changeQualityButton ||
            text === i18n.videoTool.changeDurationButton ||
            text === i18n.videoTool.changeStyleButton
        ) {
            return true;
        }

        if (
            text === i18n.videoTool.sendAsFileButton(true) ||
            text === i18n.videoTool.sendAsFileButton(false)
        ) {
            return true;
        }

        if (
            text.startsWith('📐 ') ||
            text.startsWith('🖼 ') ||
            text.startsWith('✨ ') ||
            text.startsWith('⏱ ') ||
            text.startsWith('🎨 ')
        ) {
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

export function getVideoToolCapabilities(
    toolId: AiToolId,
    capabilitiesService: VideoCapabilitiesService,
    localeTag: 'ru-RU' | 'en-US',
) {
    const styleOptions = capabilitiesService.getStyleOptions(toolId);
    const qualityOptions = capabilitiesService.getQualityOptions(toolId);
    return {
        aspectRatios: capabilitiesService.getAspectRatios(toolId),
        resolutions: capabilitiesService.getResolutions(toolId),
        qualities: qualityOptions.map((option) => ({
            value: option.value,
            label: localeTag === 'ru-RU' ? option.labelRu : option.labelEn,
        })),
        durations: capabilitiesService.getSupportedDurations(toolId),
        stylePresets: styleOptions.map((option) => {
            const baseLabel =
                localeTag === 'ru-RU' ? option.labelRu : option.labelEn;
            return {
                id: option.id,
                label: option.source === 'model' ? `✦ ${baseLabel}` : baseLabel,
                source: option.source,
            };
        }),
    };
}

export function buildVideoSummaryLine(
    i18n: I18nBundle,
    options: {
        settings: VideoToolSettings;
        aspectRatios: string[];
        resolutions: string[];
        toolId: AiToolId;
        localeTag: 'ru-RU' | 'en-US';
        capabilitiesService: VideoCapabilitiesService;
    },
): string | null {
    const tool = getToolById(options.toolId);
    const duration =
        options.settings.durationSeconds ?? tool?.defaultDurationSeconds;
    const credits =
        tool && duration
            ? calculateToolTokenCost(tool, {
                  durationSeconds: duration,
                  resolution: options.settings.resolution,
                  quality: options.settings.quality,
              })
            : undefined;

    const parts = {
        format:
            options.aspectRatios.length > 0
                ? (options.settings.aspectRatio ?? options.aspectRatios[0])
                : undefined,
        resolution:
            options.resolutions.length > 0
                ? (options.settings.resolution ?? options.resolutions[0])
                : undefined,
        qualityLabel:
            options.settings.quality &&
            options.capabilitiesService.supportsQuality(options.toolId)
                ? getVideoQualityLabel(
                      options.settings.quality,
                      options.localeTag,
                      options.capabilitiesService.getQualityOptions(
                          options.toolId,
                      ),
                  )
                : undefined,
        durationSeconds: duration,
        styleLabel:
            options.settings.styleId && options.settings.styleId !== 'none'
                ? getVideoStyleLabel(
                      options.settings.styleId,
                      options.localeTag,
                      options.capabilitiesService.getStyleOptions(
                          options.toolId,
                      ),
                  )
                : undefined,
        credits,
    };

    if (
        !parts.format &&
        !parts.resolution &&
        !parts.qualityLabel &&
        !parts.durationSeconds &&
        !parts.styleLabel
    ) {
        return null;
    }

    return i18n.videoTool.summaryLine(parts);
}
