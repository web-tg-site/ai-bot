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
import { AiGenerationInput, AiGenerationResult, AiToolId } from '../types';
import {
    isSharpiiMidjourneyUpstreamError,
    isSharpiiMidjourneyGenericFailure,
} from '../providers/sharpii.provider';
import {
    AI_JOB_COMPLETED_TEXT,
    AI_JOB_STALE_REMINDER_TEXT,
    AI_MIDJOURNEY_FALLBACK_TEXT,
} from '@/common/services/bot/texts';
import { isNanoBanana1KResolution } from '@/common/config/image-editor-capabilities.config';
import { getI18n } from '@/common/services/bot/i18n';
import { formatUserBotErrorMessage } from '@/common/services/bot/errors/bot-error.mapper';
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
        private readonly userAiToolSettingsModelService: UserAiToolSettingsModelService,
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
                const input = job.inputJson as AiGenerationInput;

                if (
                    toolId === AiToolId.MIDJOURNEY &&
                    (isSharpiiMidjourneyUpstreamError(errorMessage) ||
                        isSharpiiMidjourneyGenericFailure(errorMessage))
                ) {
                    this.fallbackJobIds.add(job.id);
                    void this.handleMidjourneyFluxFallback(
                        botService,
                        job,
                    ).finally(() => {
                        this.fallbackJobIds.delete(job.id);
                    });
                    return;
                }

                if (
                    toolId === AiToolId.NANO_BANANA &&
                    isNanoBanana1KResolution(input.resolution)
                ) {
                    this.fallbackJobIds.add(job.id);
                    void this.handleNanoBananaOpenRouterFallback(
                        botService,
                        job,
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

            await this.sendResult(
                botService,
                job.user.telegramId,
                job.toolId as AiToolId,
                resolved.type,
                resolved,
                await this.resolveSendAsFile(
                    job.userId,
                    job.toolId as AiToolId,
                ),
            );

            await this.aiJobService.updateJobStatus(
                job.id,
                JobStatus.COMPLETED,
                {
                    resultUrl: resolved.url,
                },
            );

            await botService.sendMessage(
                job.user.telegramId,
                AI_JOB_COMPLETED_TEXT,
                { parse_mode: 'HTML' },
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Не удалось отправить результат';
            this.logJobError(job, 'delivery', error);
            await this.failJob(botService, job, message);
        }
    }

    private async failJob(
        botService: BotService,
        job: PendingJob,
        errorMessage: string,
    ) {
        const i18n = getI18n(job.user.language);
        const formattedError = formatUserBotErrorMessage(errorMessage, i18n);

        await this.aiJobService.failJobWithRefund({
            jobId: job.id,
            telegramId: job.user.telegramId,
            tokenCost: job.tokenCost,
            errorMessage,
        });

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

    private async handleNanoBananaOpenRouterFallback(
        botService: BotService,
        job: PendingJob,
    ) {
        const input = job.inputJson as AiGenerationInput;
        const i18n = getI18n(job.user.language);

        try {
            await botService.sendMessage(
                job.user.telegramId,
                i18n.aiResult.generationTakingLonger,
                { parse_mode: 'HTML' },
            );

            const result =
                await this.aiService.generateNanoBananaFallback(input);
            await this.sendResult(
                botService,
                job.user.telegramId,
                AiToolId.NANO_BANANA,
                result.type,
                result,
                await this.resolveSendAsFile(job.userId, AiToolId.NANO_BANANA),
            );

            await this.aiJobService.updateJobStatus(
                job.id,
                JobStatus.COMPLETED,
                {
                    resultUrl: result.url,
                },
            );

            await botService.sendMessage(
                job.user.telegramId,
                AI_JOB_COMPLETED_TEXT,
                { parse_mode: 'HTML' },
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Не удалось завершить генерацию';
            this.logJobError(job, 'delivery', error);
            await this.failJob(botService, job, message);
        }
    }

    private async handleMidjourneyFluxFallback(
        botService: BotService,
        job: PendingJob,
    ) {
        const input = job.inputJson as AiGenerationInput;

        try {
            await botService.sendMessage(
                job.user.telegramId,
                AI_MIDJOURNEY_FALLBACK_TEXT,
                { parse_mode: 'HTML' },
            );

            const result = await this.aiService.generate(AiToolId.FLUX, input);
            await this.sendResult(
                botService,
                job.user.telegramId,
                AiToolId.FLUX,
                result.type,
                result,
                await this.resolveSendAsFile(job.userId, AiToolId.FLUX),
            );

            await this.aiJobService.updateJobStatus(
                job.id,
                JobStatus.COMPLETED,
                {
                    resultUrl: result.url,
                },
            );

            await botService.sendMessage(
                job.user.telegramId,
                AI_JOB_COMPLETED_TEXT,
                { parse_mode: 'HTML' },
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Не удалось выполнить fallback на Flux';
            this.logJobError(job, 'delivery', error);
            await this.failJob(botService, job, message);
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
            toolId === AiToolId.VIDEO_TO_AUDIO
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
    ) {
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
                    );
                } else {
                    await botService.sendVideo(telegramId, result.url);
                }
            } else if (type === 'image') {
                const parsed = parseDataUrl(result.url);
                if (parsed) {
                    await botService.sendPhotoBuffer(
                        telegramId,
                        parsed.buffer,
                        parsed.mimeType,
                        sendAsFile,
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
                    );
                } else {
                    await botService.sendPhoto(telegramId, result.url);
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

        if (result.buffer) {
            if (type === 'image') {
                await botService.sendPhotoBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                    sendAsFile,
                );
            } else if (type === 'video') {
                await botService.sendVideoBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                    sendAsFile,
                );
            } else if (type === 'audio') {
                await botService.sendAudioBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                    sendAsFile,
                );
            }
        }
    }
}
