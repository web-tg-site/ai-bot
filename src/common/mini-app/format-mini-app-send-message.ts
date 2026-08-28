import { getToolById } from '@/common/config/ai-tools.registry';
import { formatImageQualityLabel } from '@/common/config/image-editor-capabilities.config';
import { getVideoQualityLabel } from '@/common/config/video-editor-capabilities.config';
import { AiGenerationInput, AiToolId } from '@/common/services/ai/types';
import { getToolLabel } from '@/common/services/bot/i18n';
import { formatNumber } from '@/common/services/bot/i18n/format';
import { UserLanguage } from '@/generated/prisma/enums';

const TELEGRAM_MESSAGE_MAX = 4096;

export function buildPublicJobMediaUrl(
    jobId: string,
    publicBaseUrl?: string | null,
): string | null {
    const base = publicBaseUrl?.trim().replace(/\/$/, '');
    if (!base) {
        return null;
    }
    return `${base}/api/public/jobs/${encodeURIComponent(jobId)}/media`;
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getLocaleTag(language?: UserLanguage | null): 'ru-RU' | 'en-US' {
    return language === UserLanguage.EN ? 'en-US' : 'ru-RU';
}

export function formatGenerationSettingsLines(
    toolId: AiToolId,
    input: AiGenerationInput,
    language?: UserLanguage | null,
): string[] {
    const locale = getLocaleTag(language);
    const lines: string[] = [];

    switch (toolId) {
        case AiToolId.NANO_BANANA:
        case AiToolId.SEEDREAM:
            if (input.resolution) {
                lines.push(`✨ Качество: ${escapeHtml(input.resolution)}`);
            }
            break;
        case AiToolId.GPT_IMAGES:
        case AiToolId.FLUX:
            if (input.quality) {
                lines.push(
                    `✨ Качество: ${escapeHtml(formatImageQualityLabel(input.quality, locale))}`,
                );
            }
            break;
        case AiToolId.TOPAZ:
            if (input.topazScale) {
                lines.push(`✨ Масштаб: ×${input.topazScale}`);
            }
            break;
        case AiToolId.KLING:
        case AiToolId.KLING_MOTION:
        case AiToolId.SORA:
        case AiToolId.SEEDANCE:
        case AiToolId.VEO:
        case AiToolId.LUMA_RAY:
        case AiToolId.HIGGSFIELD:
            if (input.resolution) {
                lines.push(`✨ Разрешение: ${escapeHtml(input.resolution)}`);
            }
            if (input.quality) {
                lines.push(
                    `✨ Качество: ${escapeHtml(getVideoQualityLabel(input.quality, locale))}`,
                );
            }
            if (input.durationSeconds) {
                lines.push(`⏱ Длительность: ${input.durationSeconds} сек`);
            }
            break;
        case AiToolId.HEYGEN:
            if (input.durationSeconds) {
                lines.push(`⏱ Длительность: ${input.durationSeconds} сек`);
            }
            break;
        case AiToolId.SUNO:
            if (input.sunoInstrumental) {
                lines.push('🎵 Инструментал');
            }
            if (input.sunoTitle?.trim()) {
                lines.push(`🎵 Название: ${escapeHtml(input.sunoTitle.trim())}`);
            }
            break;
        case AiToolId.ELEVENLABS_VOICE:
        case AiToolId.VOICE_CLONE:
        case AiToolId.SOUND_GENERATOR:
        case AiToolId.VIDEO_TO_AUDIO:
            break;
        default:
            if (input.resolution) {
                lines.push(`✨ Разрешение: ${escapeHtml(input.resolution)}`);
            }
            if (input.quality) {
                lines.push(`✨ Качество: ${escapeHtml(input.quality)}`);
            }
            if (input.durationSeconds) {
                lines.push(`⏱ Длительность: ${input.durationSeconds} сек`);
            }
            break;
    }

    return lines;
}

export function formatMiniAppSendMessage(params: {
    jobId: string;
    toolId: AiToolId;
    prompt?: string | null;
    inputJson: unknown;
    tokenCost: number;
    tokenLeft: number;
    publicBaseUrl?: string | null;
    language?: UserLanguage | null;
    partialWarning?: string | null;
}): string {
    const {
        jobId,
        toolId,
        prompt,
        inputJson,
        tokenCost,
        tokenLeft,
        publicBaseUrl,
        language,
        partialWarning,
    } = params;

    const input = (inputJson ?? {}) as AiGenerationInput;
    const modelLabel = getToolLabel(toolId, language);
    const parts: string[] = [];

    const publicUrl = buildPublicJobMediaUrl(jobId, publicBaseUrl);
    if (publicUrl) {
        parts.push(
            `Вот прямая <a href="${escapeHtml(publicUrl)}">ссылка</a> на качественную версию.`,
        );
        parts.push('');
    }

    const trimmedPrompt = prompt?.trim() || input.prompt?.trim() || '';
    if (trimmedPrompt) {
        parts.push('📍 Ваш запрос:');
        parts.push(`<pre>${escapeHtml(trimmedPrompt)}</pre>`);
        parts.push('');
    }

    const settingsLines = formatGenerationSettingsLines(toolId, input, language);
    if (settingsLines.length > 0) {
        parts.push(...settingsLines);
    }

    parts.push(`🧮 Модель: ${escapeHtml(modelLabel)}`);
    parts.push('');

    const lang = language ?? UserLanguage.RU;
    const formattedCost = formatNumber(tokenCost, lang);
    const formattedBalance = formatNumber(tokenLeft, lang);
    parts.push(
        `ℹ️ Списано: ⚡-${formattedCost}. Баланс: ⚡${formattedBalance} (${escapeHtml(modelLabel)})`,
    );

    if (partialWarning?.trim()) {
        parts.push('');
        parts.push(escapeHtml(partialWarning.trim()));
    }

    let message = parts.join('\n');
    if (message.length > TELEGRAM_MESSAGE_MAX) {
        const overhead = message.length - trimmedPrompt.length;
        const maxPromptLen = Math.max(
            0,
            TELEGRAM_MESSAGE_MAX - overhead - 20,
        );
        if (trimmedPrompt && maxPromptLen < trimmedPrompt.length) {
            const truncated = `${trimmedPrompt.slice(0, maxPromptLen)}…`;
            return formatMiniAppSendMessage({
                ...params,
                prompt: truncated,
                inputJson: { ...input, prompt: truncated },
            });
        }
        message = `${message.slice(0, TELEGRAM_MESSAGE_MAX - 1)}…`;
    }

    return message;
}
