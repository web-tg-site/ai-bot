import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ModuleRef } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobStatus } from '@/generated/prisma/enums';
import { BotService } from '@/common/services/bot';
import { getToolById } from '@/common/config/ai-tools.registry';
import { AiService } from '../ai.service';
import { AiJobService } from './ai-job.service';
import { AiGenerationInput, AiToolId } from '../types';
import { isSharpiiMidjourneyUpstreamError } from '../providers/sharpii.provider';
import {
    AI_JOB_COMPLETED_TEXT,
    AI_JOB_FAILED_TEXT,
    AI_MIDJOURNEY_FALLBACK_TEXT,
} from '@/common/services/bot/texts';
import { parseDataUrl } from '@/common/utils/parse-data-url';

@Injectable()
export class AiJobCron {
    private isProcessing = false;

    constructor(
        @InjectPinoLogger(AiJobCron.name)
        private readonly logger: PinoLogger,
        private readonly aiJobService: AiJobService,
        private readonly aiService: AiService,
        private readonly moduleRef: ModuleRef,
    ) {}

    private getBotService(): BotService {
        return this.moduleRef.get(BotService, { strict: false });
    }

    @Cron('*/15 * * * * *')
    async pollPendingJobs() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        const botService = this.getBotService();

        try {
            const jobs = await this.aiJobService.getPendingJobs();

            for (const job of jobs) {
                if (!job.providerJobId) continue;

                try {
                    const status = await this.aiService.getJobStatus(
                        job.toolId as AiToolId,
                        job.providerJobId,
                    );

                    if (
                        status.status === 'processing' ||
                        status.status === 'pending'
                    ) {
                        if (job.status === JobStatus.PENDING) {
                            await this.aiJobService.updateJobStatus(
                                job.id,
                                JobStatus.PROCESSING,
                            );
                        }
                        continue;
                    }

                    if (status.status === 'completed' && status.result) {
                        try {
                            await this.sendResult(
                                botService,
                                job.user.telegramId,
                                status.result.type,
                                status.result,
                            );

                            await this.aiJobService.updateJobStatus(
                                job.id,
                                JobStatus.COMPLETED,
                                {
                                    resultUrl: status.result.url,
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

                            await this.aiJobService.updateJobStatus(
                                job.id,
                                JobStatus.FAILED,
                                { errorMessage: message },
                            );

                            await botService.sendMessage(
                                job.user.telegramId,
                                AI_JOB_FAILED_TEXT(message),
                                { parse_mode: 'HTML' },
                            );
                        }
                        continue;
                    }

                    if (status.status === 'failed') {
                        if (
                            (job.toolId as AiToolId) === AiToolId.MIDJOURNEY &&
                            isSharpiiMidjourneyUpstreamError(
                                status.errorMessage ?? '',
                            )
                        ) {
                            await this.handleMidjourneyFluxFallback(
                                botService,
                                job,
                            );
                            continue;
                        }

                        await this.aiJobService.updateJobStatus(
                            job.id,
                            JobStatus.FAILED,
                            {
                                errorMessage: status.errorMessage,
                            },
                        );

                        await botService.sendMessage(
                            job.user.telegramId,
                            AI_JOB_FAILED_TEXT(
                                status.errorMessage ?? 'Неизвестная ошибка',
                            ),
                            { parse_mode: 'HTML' },
                        );
                    }
                } catch (error) {
                    this.logJobError(job, 'poll', error);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private logJobError(
        job: Awaited<ReturnType<AiJobService['getPendingJobs']>>[number],
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
                phase,
                err: error,
            },
            `AI job ${phase} failed [${toolLabel}/${provider}]: ${message}`,
        );
    }

    private async handleMidjourneyFluxFallback(
        botService: BotService,
        job: Awaited<ReturnType<AiJobService['getPendingJobs']>>[number],
    ) {
        const input = job.inputJson as AiGenerationInput;

        await botService.sendMessage(
            job.user.telegramId,
            AI_MIDJOURNEY_FALLBACK_TEXT,
            {
                parse_mode: 'HTML',
            },
        );

        const result = await this.aiService.generate(AiToolId.FLUX, input);
        await this.sendResult(
            botService,
            job.user.telegramId,
            result.type,
            result,
        );

        await this.aiJobService.updateJobStatus(job.id, JobStatus.COMPLETED, {
            resultUrl: result.url,
        });

        await botService.sendMessage(
            job.user.telegramId,
            AI_JOB_COMPLETED_TEXT,
            {
                parse_mode: 'HTML',
            },
        );
    }

    private async sendResult(
        botService: BotService,
        telegramId: string,
        type: string,
        result: {
            url?: string;
            buffer?: Buffer;
            mimeType?: string;
            text?: string;
        },
    ) {
        if (result.url) {
            if (type === 'video') {
                await botService.sendVideo(telegramId, result.url);
            } else if (type === 'image') {
                const parsed = parseDataUrl(result.url);
                if (parsed) {
                    await botService.sendPhotoBuffer(
                        telegramId,
                        parsed.buffer,
                        parsed.mimeType,
                    );
                } else {
                    await botService.sendPhoto(telegramId, result.url);
                }
            } else if (type === 'audio') {
                await botService.sendAudio(telegramId, result.url);
            }
            return;
        }

        if (result.buffer) {
            if (type === 'image') {
                await botService.sendPhotoBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                );
            } else if (type === 'video') {
                await botService.sendVideoBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                );
            } else if (type === 'audio') {
                await botService.sendAudioBuffer(
                    telegramId,
                    result.buffer,
                    result.mimeType,
                );
            }
        }
    }
}
