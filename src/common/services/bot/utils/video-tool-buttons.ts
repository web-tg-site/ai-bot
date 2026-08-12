import { AiToolId } from '@/common/services/ai/types';
import { AiSessionStep } from '@/common/services/ai/types/ai-session-state.type';
import { VideoCapabilitiesService } from '@/common/services/ai/video-capabilities.service';
import {
    getVideoQualityLabel,
    getVideoStyleLabel,
    isVideoToolWithAspectSettings,
} from '@/common/config/video-editor-capabilities.config';
import {
    filterCuratedHiggsfieldMotions,
    type HiggsfieldMotionOption,
} from '@/common/config/higgsfield-motions.config';
import {
    HEYGEN_BACKGROUND_COLOR_PRESETS,
    HEYGEN_ENGINE_OPTIONS,
    HEYGEN_EXPRESSIVENESS_OPTIONS,
    getHeyGenBackgroundLabel,
    getHeyGenEngineLabel,
    type HeyGenAvatarLookOption,
    type HeyGenVoiceOption,
} from '@/common/config/heygen.config';
import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';
import { I18nBundle, ru, en } from '../i18n';
import {
    VideoKeyboardMode,
    resolveHeygenPagedSelection,
} from '../keyboards/video.keyboard';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { resolveVideoSendAsFile } from '@/common/utils/resolve-send-as-file';

export type VideoToolButtonAction =
    | { type: 'open_settings' }
    | { type: 'open_aspect_picker' }
    | { type: 'open_resolution_picker' }
    | { type: 'open_quality_picker' }
    | { type: 'open_duration_picker' }
    | { type: 'open_style_picker' }
    | { type: 'open_effect_picker' }
    | { type: 'open_heygen_voice_picker' }
    | { type: 'open_heygen_avatar_picker' }
    | { type: 'open_heygen_engine_picker' }
    | { type: 'open_heygen_background_picker' }
    | { type: 'open_heygen_expressiveness_picker' }
    | { type: 'open_heygen_speed_picker' }
    | { type: 'open_heygen_pitch_picker' }
    | { type: 'toggle_heygen_captions' }
    | { type: 'heygen_next_page' }
    | { type: 'heygen_prev_page' }
    | { type: 'set_aspect'; value: string }
    | { type: 'set_resolution'; value: string }
    | { type: 'set_quality'; value: string }
    | { type: 'set_duration'; value: number }
    | { type: 'set_style'; value: string }
    | { type: 'set_effect'; value: string }
    | { type: 'set_heygen_voice'; value: string }
    | { type: 'set_heygen_avatar'; value: string }
    | { type: 'set_heygen_engine'; value: string }
    | { type: 'set_heygen_background'; value: string }
    | { type: 'set_heygen_expressiveness'; value: string }
    | { type: 'set_heygen_speed'; value: number }
    | { type: 'set_heygen_pitch'; value: number }
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
        effectPresets?: Array<{ id: string; label: string }>;
        heygenVoices?: HeyGenVoiceOption[];
        heygenAvatars?: HeyGenAvatarLookOption[];
        heygenVoicePage?: number;
        heygenAvatarPage?: number;
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

    if (options.keyboardMode === 'effect') {
        for (const preset of options.effectPresets ?? []) {
            if (
                text === i18n.videoTool.effectPickerOption(preset.label) ||
                text === i18n.videoTool.effectPickerSelected(preset.label)
            ) {
                return { type: 'set_effect', value: preset.id };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'heygen_voice') {
        if (text === i18n.videoTool.heygenNextPage) {
            return { type: 'heygen_next_page' };
        }
        if (text === i18n.videoTool.heygenPrevPage) {
            return { type: 'heygen_prev_page' };
        }
        if (text.startsWith('Стр. ') || text.startsWith('Page ')) {
            return null;
        }
        const voiceId = resolveHeygenPagedSelection(
            text,
            i18n,
            (options.heygenVoices ?? []).map((voice) => ({
                id: voice.id,
                label: voice.name,
            })),
            options.heygenVoicePage ?? 0,
        );
        if (voiceId) {
            return { type: 'set_heygen_voice', value: voiceId };
        }
        return null;
    }

    if (options.keyboardMode === 'heygen_avatar') {
        if (text === i18n.videoTool.heygenNextPage) {
            return { type: 'heygen_next_page' };
        }
        if (text === i18n.videoTool.heygenPrevPage) {
            return { type: 'heygen_prev_page' };
        }
        if (text.startsWith('Стр. ') || text.startsWith('Page ')) {
            return null;
        }
        const avatarId = resolveHeygenPagedSelection(
            text,
            i18n,
            (options.heygenAvatars ?? []).map((avatar) => ({
                id: avatar.id,
                label: avatar.name,
            })),
            options.heygenAvatarPage ?? 0,
        );
        if (avatarId) {
            return { type: 'set_heygen_avatar', value: avatarId };
        }
        return null;
    }

    if (options.keyboardMode === 'heygen_engine') {
        for (const option of HEYGEN_ENGINE_OPTIONS) {
            const label =
                options.localeTag === 'ru-RU'
                    ? option.labelRu
                    : option.labelEn;
            if (
                text === i18n.videoTool.heygenPickerOption(label) ||
                text === i18n.videoTool.heygenPickerSelected(label)
            ) {
                return { type: 'set_heygen_engine', value: option.id };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'heygen_background') {
        const items = [
            { id: 'default', label: getHeyGenBackgroundLabel('default', undefined, options.localeTag) },
            { id: 'remove', label: getHeyGenBackgroundLabel('remove', undefined, options.localeTag) },
            ...HEYGEN_BACKGROUND_COLOR_PRESETS.map((preset) => ({
                id: `color:${preset.id}`,
                label:
                    options.localeTag === 'ru-RU'
                        ? preset.labelRu
                        : preset.labelEn,
            })),
        ];
        for (const item of items) {
            if (
                text === i18n.videoTool.heygenPickerOption(item.label) ||
                text === i18n.videoTool.heygenPickerSelected(item.label)
            ) {
                return { type: 'set_heygen_background', value: item.id };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'heygen_expressiveness') {
        for (const option of HEYGEN_EXPRESSIVENESS_OPTIONS) {
            const label =
                options.localeTag === 'ru-RU'
                    ? option.labelRu
                    : option.labelEn;
            if (
                text === i18n.videoTool.heygenPickerOption(label) ||
                text === i18n.videoTool.heygenPickerSelected(label)
            ) {
                return {
                    type: 'set_heygen_expressiveness',
                    value: option.id,
                };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'heygen_speed') {
        for (const speed of [0.75, 1, 1.25, 1.5]) {
            const label = `${speed}x`;
            if (
                text === i18n.videoTool.heygenPickerOption(label) ||
                text === i18n.videoTool.heygenPickerSelected(label)
            ) {
                return { type: 'set_heygen_speed', value: speed };
            }
        }
        return null;
    }

    if (options.keyboardMode === 'heygen_pitch') {
        for (const pitch of [-20, -10, 0, 10, 20]) {
            const label = String(pitch);
            if (
                text === i18n.videoTool.heygenPickerOption(label) ||
                text === i18n.videoTool.heygenPickerSelected(label)
            ) {
                return { type: 'set_heygen_pitch', value: pitch };
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
            (options.effectPresets?.length ?? 0) > 0 &&
            text === i18n.videoTool.changeEffectButton
        ) {
            return { type: 'open_effect_picker' };
        }

        if (
            options.toolId === AiToolId.HEYGEN &&
            text === i18n.videoTool.changeHeygenVoiceButton
        ) {
            return { type: 'open_heygen_voice_picker' };
        }
        if (
            options.toolId === AiToolId.HEYGEN &&
            text === i18n.videoTool.changeHeygenAvatarButton
        ) {
            return { type: 'open_heygen_avatar_picker' };
        }
        if (
            options.toolId === AiToolId.HEYGEN &&
            text === i18n.videoTool.changeHeygenEngineButton
        ) {
            return { type: 'open_heygen_engine_picker' };
        }
        if (
            options.toolId === AiToolId.HEYGEN &&
            text === i18n.videoTool.changeHeygenBackgroundButton
        ) {
            return { type: 'open_heygen_background_picker' };
        }
        if (
            options.toolId === AiToolId.HEYGEN &&
            text === i18n.videoTool.changeHeygenExpressivenessButton
        ) {
            return { type: 'open_heygen_expressiveness_picker' };
        }
        if (
            options.toolId === AiToolId.HEYGEN &&
            text === i18n.videoTool.changeHeygenSpeedButton
        ) {
            return { type: 'open_heygen_speed_picker' };
        }
        if (
            options.toolId === AiToolId.HEYGEN &&
            text === i18n.videoTool.changeHeygenPitchButton
        ) {
            return { type: 'open_heygen_pitch_picker' };
        }
        if (
            options.toolId === AiToolId.HEYGEN &&
            (text === i18n.videoTool.toggleHeygenCaptionsButton(true) ||
                text === i18n.videoTool.toggleHeygenCaptionsButton(false))
        ) {
            return { type: 'toggle_heygen_captions' };
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
            text === i18n.videoTool.changeStyleButton ||
            text === i18n.videoTool.changeEffectButton ||
            text === i18n.videoTool.changeHeygenVoiceButton ||
            text === i18n.videoTool.changeHeygenAvatarButton ||
            text === i18n.videoTool.changeHeygenEngineButton ||
            text === i18n.videoTool.changeHeygenBackgroundButton ||
            text === i18n.videoTool.changeHeygenExpressivenessButton ||
            text === i18n.videoTool.changeHeygenSpeedButton ||
            text === i18n.videoTool.changeHeygenPitchButton ||
            text === i18n.videoTool.toggleHeygenCaptionsButton(true) ||
            text === i18n.videoTool.toggleHeygenCaptionsButton(false) ||
            text === i18n.videoTool.heygenNextPage ||
            text === i18n.videoTool.heygenPrevPage
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

export function buildHiggsfieldEffectPresets(
    i18n: I18nBundle,
    motions: HiggsfieldMotionOption[],
): Array<{ id: string; label: string }> {
    const curated = filterCuratedHiggsfieldMotions(motions);
    const list = curated.length > 0 ? curated : motions.slice(0, 30);
    return [
        { id: 'none', label: i18n.videoTool.noEffectLabel },
        ...list.map((motion) => ({ id: motion.id, label: motion.name })),
    ];
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
        effectPresets?: Array<{ id: string; label: string }>;
        heygenVoices?: HeyGenVoiceOption[];
        heygenAvatars?: HeyGenAvatarLookOption[];
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
        effectLabel:
            options.settings.higgsfieldMotionId &&
            options.settings.higgsfieldMotionId !== 'none'
                ? (options.effectPresets?.find(
                      (preset) =>
                          preset.id === options.settings.higgsfieldMotionId,
                  )?.label ?? options.settings.higgsfieldMotionId)
                : undefined,
        heygenVoiceLabel: options.settings.heygenVoiceId
            ? (options.heygenVoices?.find(
                  (voice) => voice.id === options.settings.heygenVoiceId,
              )?.name ?? options.settings.heygenVoiceId)
            : undefined,
        heygenAvatarLabel: options.settings.heygenAvatarId
            ? (options.heygenAvatars?.find(
                  (avatar) => avatar.id === options.settings.heygenAvatarId,
              )?.name ?? options.settings.heygenAvatarId)
            : undefined,
        heygenEngineLabel:
            options.toolId === AiToolId.HEYGEN
                ? getHeyGenEngineLabel(
                      options.settings.heygenEngine,
                      options.localeTag,
                  )
                : undefined,
        credits,
    };

    if (
        !parts.format &&
        !parts.resolution &&
        !parts.qualityLabel &&
        !parts.durationSeconds &&
        !parts.styleLabel &&
        !parts.effectLabel &&
        !parts.heygenVoiceLabel &&
        !parts.heygenAvatarLabel &&
        !parts.heygenEngineLabel
    ) {
        return null;
    }

    return i18n.videoTool.summaryLine(parts);
}
