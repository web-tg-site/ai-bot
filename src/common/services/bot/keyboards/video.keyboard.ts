import { Markup } from 'telegraf';
import { AiToolId } from '@/common/services/ai/types';
import { AiSessionStep } from '@/common/services/ai/types/ai-session-state.type';
import { I18nBundle } from '../i18n';
import { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { resolveVideoSendAsFile } from '@/common/utils/resolve-send-as-file';
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
import {
    DEFAULT_HEYGEN_BACKGROUND_COLOR,
    DEFAULT_HEYGEN_BACKGROUND_MODE,
    DEFAULT_HEYGEN_ENGINE,
    DEFAULT_HEYGEN_EXPRESSIVENESS,
    DEFAULT_HEYGEN_VOICE_PITCH,
    DEFAULT_HEYGEN_VOICE_SPEED,
    HEYGEN_BACKGROUND_COLOR_PRESETS,
    HEYGEN_ENGINE_OPTIONS,
    HEYGEN_EXPRESSIVENESS_OPTIONS,
    getHeyGenBackgroundLabel,
    getHeyGenEngineLabel,
    getHeyGenExpressivenessLabel,
    type HeyGenAvatarLookOption,
    type HeyGenVoiceOption,
} from '@/common/config/heygen.config';
import { chunkKeyboardRow } from './keyboard-grid';

export type VideoKeyboardMode =
    | 'main'
    | 'settings'
    | 'aspect'
    | 'resolution'
    | 'quality'
    | 'duration'
    | 'style'
    | 'effect'
    | 'heygen_voice'
    | 'heygen_avatar'
    | 'heygen_engine'
    | 'heygen_background'
    | 'heygen_expressiveness'
    | 'heygen_speed'
    | 'heygen_pitch';

export const HEYGEN_PICKER_PAGE_SIZE = 18;

type VideoStyleOption = {
    id: string;
    label: string;
};

type VideoEffectOption = {
    id: string;
    label: string;
};

type VideoQualityOption = {
    value: string;
    label: string;
};

function hasConfigurableSettings(options: {
    toolId: AiToolId;
    aspectRatios: string[];
    resolutions: string[];
    qualities: VideoQualityOption[];
    durations: number[];
}): boolean {
    return (
        (isVideoToolWithAspectSettings(options.toolId) &&
            (options.aspectRatios.length > 0 ||
                options.resolutions.length > 0)) ||
        options.qualities.length > 0 ||
        options.durations.length > 0 ||
        options.toolId === AiToolId.HEYGEN ||
        true
    );
}

export function generateVideoEditorReplyKeyboard(
    i18n: I18nBundle,
    options: {
        toolId: AiToolId;
        settings: VideoToolSettings;
        aspectRatios: string[];
        resolutions: string[];
        qualities: VideoQualityOption[];
        durations: number[];
        stylePresets: VideoStyleOption[];
        effectPresets?: VideoEffectOption[];
        heygenVoices?: HeyGenVoiceOption[];
        heygenAvatars?: HeyGenAvatarLookOption[];
        heygenVoicePage?: number;
        heygenAvatarPage?: number;
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
            tool,
            options.resolutions,
            options.settings.resolution ?? options.resolutions[0] ?? '720p',
            options.settings,
        );
    }

    if (options.keyboardMode === 'quality') {
        return generateQualityPickerKeyboard(
            i18n,
            tool,
            options.qualities,
            options.settings.quality ??
                options.qualities[0]?.value ??
                'standard',
            options.settings,
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

    if (options.keyboardMode === 'effect') {
        return generateEffectPickerKeyboard(
            i18n,
            options.effectPresets ?? [],
            options.settings.higgsfieldMotionId ?? 'none',
        );
    }

    if (options.keyboardMode === 'heygen_voice') {
        return generateHeygenPagedPickerKeyboard(
            i18n,
            (options.heygenVoices ?? []).map((voice) => ({
                id: voice.id,
                label: voice.name,
            })),
            options.settings.heygenVoiceId,
            options.heygenVoicePage ?? 0,
        );
    }

    if (options.keyboardMode === 'heygen_avatar') {
        return generateHeygenPagedPickerKeyboard(
            i18n,
            (options.heygenAvatars ?? []).map((avatar) => ({
                id: avatar.id,
                label: avatar.name,
            })),
            options.settings.heygenAvatarId,
            options.heygenAvatarPage ?? 0,
        );
    }

    if (options.keyboardMode === 'heygen_engine') {
        return generateSimpleHeygenPickerKeyboard(
            i18n,
            HEYGEN_ENGINE_OPTIONS.map((option) => ({
                id: option.id,
                label:
                    options.localeTag === 'ru-RU'
                        ? option.labelRu
                        : option.labelEn,
            })),
            options.settings.heygenEngine ?? DEFAULT_HEYGEN_ENGINE,
        );
    }

    if (options.keyboardMode === 'heygen_background') {
        const items = [
            {
                id: 'default',
                label: getHeyGenBackgroundLabel(
                    'default',
                    undefined,
                    options.localeTag,
                ),
            },
            {
                id: 'remove',
                label: getHeyGenBackgroundLabel(
                    'remove',
                    undefined,
                    options.localeTag,
                ),
            },
            ...HEYGEN_BACKGROUND_COLOR_PRESETS.map((preset) => ({
                id: `color:${preset.id}`,
                label:
                    options.localeTag === 'ru-RU'
                        ? preset.labelRu
                        : preset.labelEn,
            })),
        ];
        const currentMode =
            options.settings.heygenBackgroundMode ??
            DEFAULT_HEYGEN_BACKGROUND_MODE;
        const currentId =
            currentMode === 'color'
                ? `color:${options.settings.heygenBackgroundColor ?? DEFAULT_HEYGEN_BACKGROUND_COLOR}`
                : currentMode;
        return generateSimpleHeygenPickerKeyboard(i18n, items, currentId);
    }

    if (options.keyboardMode === 'heygen_expressiveness') {
        return generateSimpleHeygenPickerKeyboard(
            i18n,
            HEYGEN_EXPRESSIVENESS_OPTIONS.map((option) => ({
                id: option.id,
                label:
                    options.localeTag === 'ru-RU'
                        ? option.labelRu
                        : option.labelEn,
            })),
            options.settings.heygenExpressiveness ??
                DEFAULT_HEYGEN_EXPRESSIVENESS,
        );
    }

    if (options.keyboardMode === 'heygen_speed') {
        const speeds = [0.75, 1, 1.25, 1.5];
        return generateSimpleHeygenPickerKeyboard(
            i18n,
            speeds.map((speed) => ({
                id: String(speed),
                label: `${speed}x`,
            })),
            String(
                options.settings.heygenVoiceSpeed ?? DEFAULT_HEYGEN_VOICE_SPEED,
            ),
        );
    }

    if (options.keyboardMode === 'heygen_pitch') {
        const pitches = [-20, -10, 0, 10, 20];
        return generateSimpleHeygenPickerKeyboard(
            i18n,
            pitches.map((pitch) => ({
                id: String(pitch),
                label: String(pitch),
            })),
            String(
                options.settings.heygenVoicePitch ?? DEFAULT_HEYGEN_VOICE_PITCH,
            ),
        );
    }

    const rows: string[][] = [];

    if (
        hasConfigurableSettings({
            toolId: options.toolId,
            aspectRatios: options.aspectRatios,
            resolutions: options.resolutions,
            qualities: options.qualities,
            durations: options.durations,
        })
    ) {
        rows.push([i18n.videoTool.settingsButton]);
    }

    if (
        options.step === 'awaiting_video_references' &&
        isVideoToolWithReferences(options.toolId)
    ) {
        rows.push([i18n.videoTool.continueToPrompt]);
        rows.push([i18n.videoTool.skipRefs]);
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
        qualities: VideoQualityOption[];
        durations: number[];
        stylePresets: VideoStyleOption[];
        effectPresets?: VideoEffectOption[];
    },
) {
    const settingButtons: string[] = [];

    if (
        isVideoToolWithAspectSettings(options.toolId) &&
        options.aspectRatios.length
    ) {
        settingButtons.push(i18n.videoTool.changeFormatButton);
    }

    if (options.resolutions.length > 1) {
        settingButtons.push(i18n.videoTool.changeResolutionButton);
    }

    if (options.qualities.length > 1) {
        settingButtons.push(i18n.videoTool.changeQualityButton);
    }

    if (options.durations.length) {
        settingButtons.push(i18n.videoTool.changeDurationButton);
    }

    if (options.stylePresets.length) {
        settingButtons.push(i18n.videoTool.changeStyleButton);
    }

    if (
        options.toolId === AiToolId.HIGGSFIELD &&
        (options.effectPresets?.length ?? 0) > 0
    ) {
        settingButtons.push(i18n.videoTool.changeEffectButton);
    }

    if (options.toolId === AiToolId.HEYGEN) {
        settingButtons.push(
            i18n.videoTool.changeHeygenVoiceButton,
            i18n.videoTool.changeHeygenAvatarButton,
            i18n.videoTool.changeHeygenEngineButton,
            i18n.videoTool.toggleHeygenCaptionsButton(
                Boolean(options.settings.heygenCaptions),
            ),
            i18n.videoTool.changeHeygenBackgroundButton,
            i18n.videoTool.changeHeygenExpressivenessButton,
            i18n.videoTool.changeHeygenSpeedButton,
            i18n.videoTool.changeHeygenPitchButton,
        );
    }

    const rows = chunkKeyboardRow(settingButtons).map((chunk) => [...chunk]);
    rows.push([
        i18n.videoTool.sendAsFileButton(
            resolveVideoSendAsFile(options.toolId, options.settings),
        ),
    ]);
    rows.push([i18n.videoTool.backToEditor]);
    return Markup.keyboard(rows).resize();
}

function generateHeygenPagedPickerKeyboard(
    i18n: I18nBundle,
    items: Array<{ id: string; label: string }>,
    currentId: string | undefined,
    page: number,
) {
    const totalPages = Math.max(
        1,
        Math.ceil(items.length / HEYGEN_PICKER_PAGE_SIZE),
    );
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const slice = items.slice(
        safePage * HEYGEN_PICKER_PAGE_SIZE,
        (safePage + 1) * HEYGEN_PICKER_PAGE_SIZE,
    );

    const labels = slice.map((item) =>
        item.id === currentId
            ? i18n.videoTool.heygenPickerSelected(item.label)
            : i18n.videoTool.heygenPickerOption(item.label),
    );
    const rows = chunkKeyboardRow(labels).map((chunk) => [...chunk]);

    if (totalPages > 1) {
        const nav: string[] = [];
        if (safePage > 0) nav.push(i18n.videoTool.heygenPrevPage);
        nav.push(i18n.videoTool.heygenPageLabel(safePage + 1, totalPages));
        if (safePage < totalPages - 1) nav.push(i18n.videoTool.heygenNextPage);
        rows.push(nav);
    }

    rows.push([i18n.videoTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}

function generateSimpleHeygenPickerKeyboard(
    i18n: I18nBundle,
    items: Array<{ id: string; label: string }>,
    currentId: string,
) {
    const labels = items.map((item) =>
        item.id === currentId
            ? i18n.videoTool.heygenPickerSelected(item.label)
            : i18n.videoTool.heygenPickerOption(item.label),
    );
    const rows = chunkKeyboardRow(labels).map((chunk) => [...chunk]);
    rows.push([i18n.videoTool.backToSettings]);
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
    tool: AiToolConfig | undefined,
    resolutions: string[],
    current: string,
    settings: VideoToolSettings,
) {
    const rows = chunkKeyboardRow(resolutions).map((chunk) =>
        chunk.map((resolution) => {
            const tokens = tool
                ? calculateToolTokenCost(tool, {
                      durationSeconds:
                          settings.durationSeconds ??
                          tool.defaultDurationSeconds,
                      resolution,
                      quality: settings.quality,
                  })
                : 0;
            return resolution === current
                ? i18n.videoTool.resolutionPickerSelected(resolution, tokens)
                : i18n.videoTool.resolutionPickerOption(resolution, tokens);
        }),
    );

    rows.push([i18n.videoTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}

function generateQualityPickerKeyboard(
    i18n: I18nBundle,
    tool: AiToolConfig | undefined,
    qualities: VideoQualityOption[],
    current: string,
    settings: VideoToolSettings,
) {
    const rows = chunkKeyboardRow(qualities).map((chunk) =>
        chunk.map((option) => {
            const tokens = tool
                ? calculateToolTokenCost(tool, {
                      durationSeconds:
                          settings.durationSeconds ??
                          tool.defaultDurationSeconds,
                      resolution: settings.resolution,
                      quality: option.value,
                  })
                : 0;
            return option.value === current
                ? i18n.videoTool.qualityPickerSelected(option.label, tokens)
                : i18n.videoTool.qualityPickerOption(option.label, tokens);
        }),
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
                ? calculateToolTokenCost(tool, {
                      durationSeconds: seconds,
                      resolution: options.settings.resolution,
                      quality: options.settings.quality,
                  })
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

function generateEffectPickerKeyboard(
    i18n: I18nBundle,
    effectPresets: VideoEffectOption[],
    currentEffectId: string,
) {
    const rows = chunkKeyboardRow(effectPresets).map((chunk) =>
        chunk.map((preset) =>
            preset.id === currentEffectId
                ? i18n.videoTool.effectPickerSelected(preset.label)
                : i18n.videoTool.effectPickerOption(preset.label),
        ),
    );

    rows.push([i18n.videoTool.backToSettings]);
    return Markup.keyboard(rows).resize();
}

export function resolveHeygenPagedSelection(
    text: string,
    i18n: I18nBundle,
    items: Array<{ id: string; label: string }>,
    page: number,
): string | null {
    const totalPages = Math.max(
        1,
        Math.ceil(items.length / HEYGEN_PICKER_PAGE_SIZE),
    );
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const slice = items.slice(
        safePage * HEYGEN_PICKER_PAGE_SIZE,
        (safePage + 1) * HEYGEN_PICKER_PAGE_SIZE,
    );
    for (const item of slice) {
        if (
            text === i18n.videoTool.heygenPickerOption(item.label) ||
            text === i18n.videoTool.heygenPickerSelected(item.label)
        ) {
            return item.id;
        }
    }
    return null;
}

export {
    getHeyGenBackgroundLabel,
    getHeyGenEngineLabel,
    getHeyGenExpressivenessLabel,
};
