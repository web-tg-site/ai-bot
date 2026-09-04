import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ModuleRef } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobStatus } from '@/generated/prisma/enums';
import { BotService } from '@/common/services/bot';
import { getToolById } from '@/common/config/ai-tools.registry';
import {
    AI_JOB_CRON_TICK_BUDGET_MS,
    AI_JOB_MAX_POLL_ERRORS,
    AI_JOB_STALE_REMINDER_MS,
} from '@/common/config/ai-job.config';
import { AiService } from '../ai.service';
import { AiJobService } from './ai-job.service';
import { AiGenerationResult, AiToolId } from '../types';
import { AI_JOB_STALE_REMINDER_TEXT } from '@/common/services/bot/texts';
import { getI18n, getToolLabel } from '@/common/services/bot/i18n';
import {
    formatUserBotErrorMessage,
    toUserFacingError,
} from '@/common/services/bot/errors/bot-error.mapper';
import { parseDataUrl } from '@/common/utils/parse-data-url';
import { isElevenLabsDubbingResultUrl } from '../providers/elevenlabs.provider';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import {
    resolveImageSendAsFile,
    resolveVideoSendAsFile,
    resolveVoiceSendAsFile,
} from '@/common/utils/resolve-send-as-file';
import { isVideoFlowTool } from '@/common/config/video-editor-capabilities.config';
import {
    downloadRemoteFile,
    getAuthHeadersForUrl,
} from '@/common/utils/download-remote-file';
import { TempPublicMediaService } from '../temp-public-media.service';
import { buildApiframeResultKeyboard } from '@/common/services/bot/keyboards/apiframe-actions.keyboard';
import type { ApiframeResultJson } from '@/common/config/apiframe.config';
import { ModelFailoverService } from '../failover/model-failover.service';
import { Markup } from 'telegraf';
import { isFailoverEligibleTool } from '../failover/model-failover.helpers';
type PendingJob = Awaited<ReturnType<AiJobService['getPendingJobs']>>[number];

@Injectable()
export class AiJobCron {
    private isPolling = false;
    private readonly deliveringJobIds = new Set<string>();
    private readonly fallbackJobIds = new Set<string>();

    constructor(
        @InjectPinoLogger(AiJobCron.name)
        private readonly logger: PinoLogger,
        private readonly aiJobService: AiJobService,
        private readonly aiService: AiService,
        private readonly modelFailoverService: ModelFailoverService,
        private readonly userAiToolSettingsModelService: UserAiToolSettingsModelService,
        private readonly tempPublicMedia: TempPublicMediaService,
        private readonly moduleRef: ModuleRef,
    ) {}

    private getBotService(): BotService {
        return this.moduleRef.get(BotService, { strict: false });
    }

    @Cron('*/15 * * * * *')
    async pollPendingJobs() {
        if (this.isPolling) {
            return;
        }

        this.isPolling = true;
        const tickStartedAt = Date.now();

        try {
            const stats = await this.aiJobService.getStuckJobStats();
            if (stats.staleCount > 0) {
                this.logger.warn(stats, 'AI job queue has stale pending jobs');
            }

            const stuckJobs = await this.aiJobService.failStuckJobs({
                errorMessage:
                    'Генерация превысила максимальное время ожидания. Попробуйте снова.',
            });

            if (stuckJobs.length > 0) {
                const botService = this.getBotService();
                for (const job of stuckJobs) {
                    const i18n = getI18n(job.user.language);
                    const timeoutMessage =
                        i18n.aiResult.errorByCode[11] ??
                        i18n.aiResult.errorByCode[1];
                    await this.failJob(botService, job, timeoutMessage).catch(
                        (error: unknown) => {
                            this.logger.warn(
                                {
                                    jobId: job.id,
                                    err:
                                        error instanceof Error
                                            ? error.message
                                            : String(error),
                                },
                                'Failed to notify user about stuck job',
                            );
                        },
                    );
                }
            }

            void this.sendStaleReminders();

            const jobs = await this.aiJobService.getPendingJobs();

            for (const job of jobs) {
                if (Date.now() - tickStartedAt >= AI_JOB_CRON_TICK_BUDGET_MS) {
                    this.logger.warn(
                        { remainingJobs: jobs.length },
                        'AI job cron tick budget exceeded — deferring remaining jobs',
                    );
                    break;
                }

                if (!job.providerJobId) {
                    continue;
                }

                if (
                    this.deliveringJobIds.has(job.id) ||
                    this.fallbackJobIds.has(job.id)
                ) {
                    continue;
                }

                await this.pollSingleJob(job);
            }
        } finally {
            this.isPolling = false;
        }
    }

    private async pollSingleJob(job: PendingJob) {
        const botService = this.getBotService();

        try {
            const status = await this.aiService.getJobStatus(
                job.toolId as AiToolId,
                job.providerJobId!,
            );

            await this.aiJobService.recordPollAttempt(job.id, false);

            if (status.status === 'processing' || status.status === 'pending') {
                if (job.status === JobStatus.PENDING) {
                    await this.aiJobService.updateJobStatus(
                        job.id,
                        JobStatus.PROCESSING,
                    );
                }
                return;
            }

            if (status.status === 'completed') {
                if (!status.result) {
                    await this.failJob(
                        botService,
                        job,
                        'Генерация завершилась без результата. Попробуйте снова.',
                    );
                    return;
                }

                this.deliveringJobIds.add(job.id);
                void this.deliverCompletedJob(
                    botService,
                    job,
                    status.result,
                ).finally(() => {
                    this.deliveringJobIds.delete(job.id);
                });
                return;
            }

            if (status.status === 'failed') {
                const errorMessage =
                    status.errorMessage ?? 'Неизвестная ошибка';
                const toolId = job.toolId as AiToolId;

                this.logger.error(
                    {
                        jobId: job.id,
                        toolId,
                        providerJobId: job.providerJobId,
                        errorMessage,
                    },
                    `AI job provider failed [${toolId}]: ${errorMessage}`,
                );

                if (
                    isFailoverEligibleTool(toolId) &&
                    job.user.autoModelFailover !== false
                ) {
                    this.fallbackJobIds.add(job.id);
                    void this.handleModelFailover(
                        botService,
                        job,
                        errorMessage,
                    ).finally(() => {
                        this.fallbackJobIds.delete(job.id);
                    });
                    return;
                }

                await this.failJob(botService, job, errorMessage);
            }
        } catch (error) {
            this.logJobError(job, 'poll', error);
            await this.aiJobService.recordPollAttempt(job.id, true);

            const nextErrorCount = (job.pollErrorCount ?? 0) + 1;
            if (nextErrorCount >= AI_JOB_MAX_POLL_ERRORS) {
                const message =
                    error instanceof Error ? error.message : String(error);
                await this.failJob(
                    botService,
                    job,
                    `Не удалось проверить статус генерации: ${message}`,
                );
            }
        }
    }

    private async ensureJobMediaCached(
        jobId: string,
        resolved: AiGenerationResult,
        resultUrl: string | null | undefined,
    ): Promise<void> {
        if (resolved.buffer?.length) {
            this.tempPublicMedia.put({
                buffer: resolved.buffer,
                mimeType:
                    resolved.mimeType ??
                    (resolved.type === 'video'
                        ? 'video/mp4'
                        : 'application/octet-stream'),
                fileName: `job-${jobId.slice(0, 8)}`,
                jobId,
            });
            return;
        }

        const url = resultUrl ?? resolved.url;
        if (!url || isElevenLabsDubbingResultUrl(url)) {
            return;
        }
        if (!['video', 'audio', 'image'].includes(resolved.type)) {
            return;
        }

        try {
            const { buffer, mimeType } = await downloadRemoteFile(
                url,
                getAuthHeadersForUrl(url),
            );
            this.tempPublicMedia.put({
                buffer,
                mimeType: resolved.mimeType ?? mimeType,
                fileName: `job-${jobId.slice(0, 8)}`,
                jobId,
            });
        } catch (error) {
            this.logger.warn(
                {
                    jobId,
                    err: error instanceof Error ? error.message : String(error),
                },
                'Failed to cache job media from remote URL',
            );
        }
    }

    private async deliverCompletedJob(
        botService: BotService,
        job: PendingJob,
        result: AiGenerationResult,
    ) {
        try {
            const resolved = await this.aiService.resolveResultForDelivery(
                job.toolId as AiToolId,
                job.providerJobId!,
                result,
            );

            const resultUrl = resolved.url ?? result.url;

            const resultJson = resolved.resultJson ?? result.resultJson;

            await this.ensureJobMediaCached(job.id, resolved, resultUrl);

            // Persist URL first so mini-app polling is not blocked by Telegram delivery.
            await this.aiJobService.updateJobStatus(
                job.id,
                JobStatus.COMPLETED,
                {
                    resultUrl,
                    resultJson: resultJson ?? undefined,
                },
            );

            if (job.notifyTelegram === false) {
                return;
            }

            try {
                await this.sendApiframeOrDefaultResult(
                    botService,
                    job,
                    resolved,
                    resultJson,
                );

                const actionKeyboard = buildApiframeResultKeyboard(
                    job.id,
                    resultJson,
                );
                if (actionKeyboard.length > 0) {
                    const i18n = getI18n(job.user.language);
                    const hint =
                        job.toolId === AiToolId.MIDJOURNEY
                            ? (i18n.aiResult.midjourneyActionsHint ??
                              'Выберите кадр:')
                            : job.toolId === AiToolId.SUNO
                              ? (i18n.aiResult.sunoActionsHint ??
                                'Выберите действие:')
                              : 'Выберите действие:';
                    await botService.sendMessage(job.user.telegramId, hint, {
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: actionKeyboard },
                    });
                }

                await botService.sendMessage(
                    job.user.telegramId,
                    getI18n(job.user.language).aiResult.jobCompleted(
                        getToolLabel(job.toolId as AiToolId, job.user.language),
                    ),
                    { parse_mode: 'HTML' },
                );
            } catch (error) {
                // Generation succeeded; only Telegram mirror failed.
                this.logJobError(job, 'delivery', error);
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Не удалось получить результат';
            this.logJobError(job, 'delivery', error);
            await this.failJob(botService, job, message);
        }
    }

    private async sendApiframeOrDefaultResult(
        botService: BotService,
        job: PendingJob,
        resolved: AiGenerationResult,
        resultJson?: ApiframeResultJson,
    ) {
        const sendAsFile = await this.resolveSendAsFile(
            job.userId,
            job.toolId as AiToolId,
        );
        const caption = getToolLabel(job.toolId as AiToolId, job.user.language);

        if (
            resultJson?.kind === 'midjourney_grid' &&
            resultJson.images?.length
        ) {
            if (resultJson.gridUrl) {
                await this.sendResult(
                    botService,
                    job.user.telegramId,
                    job.toolId as AiToolId,
                    'image',
                    { url: resultJson.gridUrl },
                    sendAsFile,
                    `${caption} (сетка)`,
                );
            }
            for (let i = 0; i < Math.min(resultJson.images.length, 4); i++) {
                await this.sendResult(
                    botService,
                    job.user.telegramId,
                    job.toolId as AiToolId,
                    'image',
                    { url: resultJson.images[i] },
                    sendAsFile,
                    `${caption} #${i + 1}`,
                );
            }
            return;
        }

        if (
            (resultJson?.kind === 'suno_tracks' ||
                resultJson?.kind === 'suno_stems') &&
            resultJson.tracks?.length
        ) {
            for (let i = 0; i < resultJson.tracks.length; i++) {
                const track = resultJson.tracks[i];
                await this.sendResult(
                    botService,
                    job.user.telegramId,
                    job.toolId as AiToolId,
                    'audio',
                    { url: track.audioUrl, mimeType: 'audio/mpeg' },
                    true,
                    track.title
                        ? `${caption}: ${track.title}`
                        : `${caption} #${i + 1}`,
                );
            }
            return;
        }

        await this.sendResult(
            botService,
            job.user.telegramId,
            job.toolId as AiToolId,
            resolved.type,
            resolved,
            sendAsFile,
            caption,
        );
    }

    private async failJob(
        botService: BotService,
        job: PendingJob,
        errorMessage: string,
    ) {
        const i18n = getI18n(job.user.language);
        const userMessage = toUserFacingError(errorMessage, i18n);
        const formattedError = formatUserBotErrorMessage(errorMessage, i18n);

        this.logger.error(
            {
                jobId: job.id,
                toolId: job.toolId,
                providerJobId: job.providerJobId,
                rawError: errorMessage,
                userMessage,
            },
            `AI job marked failed [${job.toolId}]: ${errorMessage}`,
        );

        await this.aiJobService.failJobWithRefund({
            jobId: job.id,
            telegramId: job.user.telegramId,
            tokenCost: job.tokenCost,
            errorMessage: userMessage,
        });

        if (job.notifyTelegram === false) {
            return;
        }

        const refundSuffix =
            job.tokenCost > 0
                ? i18n.aiResult.tokensRefunded(job.tokenCost)
                : '';

        await botService.sendMessage(
            job.user.telegramId,
            refundSuffix
                ? `${formattedError}\n\n${refundSuffix}`
                : formattedError,
            { parse_mode: 'HTML' },
        );
    }

    private async sendStaleReminders() {
        const botService = this.getBotService();
        const jobs = await this.aiJobService.getJobsNeedingStaleReminder(
            AI_JOB_STALE_REMINDER_MS,
        );

        for (const job of jobs) {
            try {
                await botService.sendMessage(
                    job.user.telegramId,
                    AI_JOB_STALE_REMINDER_TEXT,
                    { parse_mode: 'HTML' },
                );
                await this.aiJobService.markStaleReminderSent(job.id);
            } catch (error: unknown) {
                this.logger.warn(
                    {
                        jobId: job.id,
                        err:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    'Failed to send stale job reminder',
                );
            }
        }
    }

    private logJobError(
        job: PendingJob,
        phase: 'poll' | 'delivery',
        error: unknown,
    ) {
        const tool = getToolById(job.toolId as AiToolId);
        const toolLabel = tool?.label ?? job.toolId;
        const provider = tool?.provider ?? 'unknown';
        const message = error instanceof Error ? error.message : String(error);

        this.logger.error(
            {
                jobId: job.id,
                toolId: job.toolId,
                toolLabel,
                provider,
                providerJobId: job.providerJobId,
                pollAttempts: job.pollAttempts,
                pollErrorCount: job.pollErrorCount,
                phase,
                err: error,
            },
            `AI job ${phase} failed [${toolLabel}/${provider}]: ${message}`,
        );
    }

    private async handleModelFailover(
        botService: BotService,
        job: PendingJob,
        errorMessage: string,
    ) {
        const result = await this.modelFailoverService.reassignPendingJob({
            jobId: job.id,
            telegramId: job.user.telegramId,
            currentToolId: job.toolId as AiToolId,
            input: job.inputJson,
            tokenCost: job.tokenCost,
            language: job.user.language,
            autoModelFailover: job.user.autoModelFailover !== false,
            errorMessage,
            failoverFromToolId: job.failoverFromToolId,
            failoverTriedToolIds: job.failoverTriedToolIds,
            botUsername: botService.getUsername() ?? null,
        });

        if (!result.ok) {
            await this.failJob(botService, job, errorMessage);
            return;
        }

        if (job.notifyTelegram !== false) {
            const i18n = getI18n(job.user.language);
            await botService.sendMessage(job.user.telegramId, result.notice, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            i18n.settings.openButton,
                            'settings:open',
                        ),
                    ],
                ]),
            });
        }
    }

    private async resolveSendAsFile(
        userId: string,
        toolId: AiToolId,
    ): Promise<boolean> {
        if (isVideoFlowTool(toolId)) {
            const settings =
                await this.userAiToolSettingsModelService.getVideoSettings(
                    userId,
                    toolId,
                );
            return resolveVideoSendAsFile(toolId, settings);
        }

        if (
            toolId === AiToolId.ELEVENLABS_VOICE ||
            toolId === AiToolId.VOICE_CLONE ||
            toolId === AiToolId.SOUND_GENERATOR ||
            toolId === AiToolId.VIDEO_TO_AUDIO ||
            toolId === AiToolId.SUNO
        ) {
            const voiceSettings =
                await this.userAiToolSettingsModelService.getVoiceSettings(
                    userId,
                    toolId,
                );
            return resolveVoiceSendAsFile(toolId, voiceSettings);
        }

        const imageSettings =
            await this.userAiToolSettingsModelService.getSettings(
                userId,
                toolId,
            );
        return resolveImageSendAsFile(toolId, imageSettings);
    }

    private async sendResult(
        botService: BotService,
        telegramId: string,
        toolId: AiToolId,
        type: string,
        result: {
            url?: string;
            buffer?: Buffer;
            mimeType?: string;
            text?: string;
        },
        sendAsFile: boolean,
        caption?: string,
    ) {
        // Prefer already-downloaded buffer (BytePlus CDN URLs are short-lived).
        if (result.buffer?.length) {
            if (type === 'image') {
                await botService.sendPhotoBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                    sendAsFile,
                    caption,
                );
            } else if (type === 'video') {
                await botService.sendVideoBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                    sendAsFile,
                    caption,
                );
            } else if (type === 'audio') {
                await botService.sendAudioBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                    sendAsFile,
                );
            }
            return;
        }

        if (result.url && !isElevenLabsDubbingResultUrl(result.url)) {
            if (type === 'video') {
                if (sendAsFile) {
                    const { buffer, mimeType } = await downloadRemoteFile(
                        result.url,
                        getAuthHeadersForUrl(result.url),
                    );
                    await botService.sendVideoBuffer(
                        telegramId,
                        buffer,
                        mimeType,
                        true,
                        caption,
                    );
                } else {
                    await botService.sendVideo(telegramId, result.url, caption);
                }
            } else if (type === 'image') {
                const parsed = parseDataUrl(result.url);
                if (parsed) {
                    await botService.sendPhotoBuffer(
                        telegramId,
                        parsed.buffer,
                        parsed.mimeType,
                        sendAsFile,
                        caption,
                    );
                } else if (sendAsFile) {
                    const { buffer, mimeType } = await downloadRemoteFile(
                        result.url,
                        getAuthHeadersForUrl(result.url),
                    );
                    await botService.sendPhotoBuffer(
                        telegramId,
                        buffer,
                        mimeType,
                        true,
                        caption,
                    );
                } else {
                    await botService.sendPhoto(telegramId, result.url, caption);
                }
            } else if (type === 'audio') {
                if (sendAsFile) {
                    await botService.sendAudio(telegramId, result.url);
                } else {
                    const { buffer, mimeType } = await downloadRemoteFile(
                        result.url,
                        getAuthHeadersForUrl(result.url),
                    );
                    await botService.sendVoiceBuffer(
                        telegramId,
                        buffer,
                        mimeType,
                    );
                }
            }
            return;
        }
    }
}
