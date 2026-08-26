import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '@/common/services/prisma';
import { JobStatus } from '@/generated/prisma/enums';
import { AiService } from '../ai.service';
import { AiGenerationInput, AiToolId } from '../types';
import { getToolById } from '@/common/config/ai-tools.registry';
import { TokenBillingService } from '../billing/token-billing.service';
import {
    AI_JOB_MAX_AGE_MS,
    AI_JOB_POLL_BATCH_SIZE,
} from '@/common/config/ai-job.config';
import { jobPromptForDb, toPersistedInputJson } from '../utils/persist-generation-input';

export type JobListItem = {
    id: string;
    toolId: string;
    status: JobStatus;
    resultUrl: string | null;
    hasResult: boolean;
    resultJson: unknown;
    providerJobId: string | null;
    errorMessage: string | null;
    tokenCost: number;
    prompt: string;
    sessionId: string | null;
    failoverNotice: string | null;
    failoverFromToolId: string | null;
    createdAt: Date;
    updatedAt: Date;
};

@Injectable()
export class AiJobService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly aiService: AiService,
        private readonly tokenBillingService: TokenBillingService,
        @InjectPinoLogger(AiJobService.name)
        private readonly logger: PinoLogger,
    ) {}

    async createJob(params: {
        userId: string;
        telegramId: string;
        toolId: AiToolId;
        input: AiGenerationInput;
        notifyTelegram?: boolean;
        sessionId?: string;
    }) {
        const tool = getToolById(params.toolId);
        if (!tool) {
            throw new Error(`Unknown tool: ${params.toolId}`);
        }

        const tokenCost = this.tokenBillingService.calculateCost(tool, {
            durationSeconds: params.input.durationSeconds,
            topazScale: params.input.topazScale,
            quality: params.input.quality,
            resolution: params.input.resolution,
            apiframeAction: params.input.apiframeAction,
        });

        const balanceCheck = await this.tokenBillingService.checkBalance(
            params.telegramId,
            tokenCost,
        );
        if (!balanceCheck.allowed) {
            throw new Error('INSUFFICIENT_TOKENS');
        }

        const providerJob = await this.aiService.createJob(
            params.toolId,
            params.input,
        );

        const deductResult = await this.tokenBillingService.commit(
            params.telegramId,
            tokenCost,
        );
        if (!deductResult.success) {
            throw new Error('INSUFFICIENT_TOKENS');
        }

        const job = await this.prismaService.aiGenerationJob.create({
            data: {
                userId: params.userId,
                toolId: params.toolId,
                providerJobId: providerJob.providerJobId,
                status: JobStatus.PENDING,
                tokenCost,
                inputJson: toPersistedInputJson(params.input, {
                    includeFiles: true,
                }),
                prompt: jobPromptForDb(params.input),
                notifyTelegram: params.notifyTelegram ?? true,
                sessionId: params.sessionId ?? null,
            },
        });

        return { job, tokenCost, balance: deductResult.balance };
    }

    /**
     * Create a pending job after tokens were already settled by failover logic.
     */
    async createJobWithoutCharge(params: {
        userId: string;
        telegramId: string;
        toolId: AiToolId;
        input: AiGenerationInput;
        tokenCost: number;
        notifyTelegram?: boolean;
        sessionId?: string;
        failoverNotice?: string | null;
        failoverFromToolId?: string | null;
        failoverTriedToolIds?: string[];
    }) {
        const providerJob = await this.aiService.createJob(
            params.toolId,
            params.input,
        );

        const job = await this.prismaService.aiGenerationJob.create({
            data: {
                userId: params.userId,
                toolId: params.toolId,
                providerJobId: providerJob.providerJobId,
                status: JobStatus.PENDING,
                tokenCost: params.tokenCost,
                inputJson: toPersistedInputJson(params.input, {
                    includeFiles: true,
                }),
                prompt: jobPromptForDb(params.input),
                notifyTelegram: params.notifyTelegram ?? true,
                sessionId: params.sessionId ?? null,
                failoverNotice: params.failoverNotice ?? null,
                failoverFromToolId: params.failoverFromToolId ?? null,
                failoverTriedToolIds: params.failoverTriedToolIds ?? undefined,
            },
        });

        return { job, tokenCost: params.tokenCost };
    }

    async reassignJobForFailover(params: {
        jobId: string;
        toolId: AiToolId;
        providerJobId: string;
        tokenCost: number;
        failoverNotice: string;
        failoverFromToolId: string;
        failoverTriedToolIds: string[];
    }) {
        await this.prismaService.aiGenerationJob.update({
            where: { id: params.jobId },
            data: {
                toolId: params.toolId,
                providerJobId: params.providerJobId,
                tokenCost: params.tokenCost,
                status: JobStatus.PENDING,
                errorMessage: null,
                pollAttempts: 0,
                pollErrorCount: 0,
                lastPolledAt: null,
                staleReminderSent: false,
                failoverNotice: params.failoverNotice,
                failoverFromToolId: params.failoverFromToolId,
                failoverTriedToolIds: params.failoverTriedToolIds,
            },
        });
    }

    /** Persist a finished sync generation so mini-app history works for all tools. */
    async recordCompletedJob(params: {
        userId: string;
        toolId: AiToolId;
        input: AiGenerationInput;
        resultUrl?: string | null;
        tokenCost: number;
        notifyTelegram?: boolean;
        sessionId?: string;
        failoverNotice?: string | null;
        failoverFromToolId?: string | null;
    }) {
        return this.prismaService.aiGenerationJob.create({
            data: {
                userId: params.userId,
                toolId: params.toolId,
                status: JobStatus.COMPLETED,
                tokenCost: params.tokenCost,
                inputJson: toPersistedInputJson(params.input, {
                    includeFiles: false,
                }),
                prompt: jobPromptForDb(params.input),
                resultUrl: params.resultUrl ?? null,
                notifyTelegram: params.notifyTelegram ?? true,
                sessionId: params.sessionId ?? null,
                failoverNotice: params.failoverNotice ?? null,
                failoverFromToolId: params.failoverFromToolId ?? null,
            },
        });
    }

    /**
     * Lightweight history list: never read inputJson or resultUrl — those
     * columns hold multi-MB data URLs / file buffers and detoasting them
     * stalls the mini-app on open.
     */
    async listJobsForUser(params: {
        userId: string;
        toolId?: string;
        toolIds?: string[];
        take?: number;
    }): Promise<JobListItem[]> {
        const jobs = await this.prismaService.aiGenerationJob.findMany({
            where: {
                userId: params.userId,
                ...(params.toolId ? { toolId: params.toolId } : {}),
                ...(params.toolIds?.length && !params.toolId
                    ? { toolId: { in: params.toolIds } }
                    : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: params.take ?? 30,
            select: {
                id: true,
                toolId: true,
                status: true,
                resultJson: true,
                providerJobId: true,
                errorMessage: true,
                tokenCost: true,
                prompt: true,
                sessionId: true,
                failoverNotice: true,
                failoverFromToolId: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return jobs.map((job) => ({
            id: job.id,
            toolId: job.toolId,
            status: job.status,
            resultUrl: null,
            hasResult: job.status === JobStatus.COMPLETED,
            resultJson: job.resultJson,
            providerJobId: job.providerJobId,
            errorMessage: job.errorMessage,
            tokenCost: job.tokenCost,
            prompt: job.prompt ?? '',
            sessionId: job.sessionId,
            failoverNotice: job.failoverNotice,
            failoverFromToolId: job.failoverFromToolId,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        }));
    }

    /** Drop binary payloads once the job can no longer failover. */
    private async stripInputFiles(jobId: string) {
        await this.prismaService.$executeRaw`
            UPDATE ai_generation_jobs
            SET "inputJson" = ("inputJson" - 'files')
            WHERE id = ${jobId}
              AND "inputJson" ? 'files'
        `;
    }

    async getPendingJobs() {
        return this.prismaService.aiGenerationJob.findMany({
            where: {
                status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
            },
            include: {
                user: {
                    select: {
                        telegramId: true,
                        language: true,
                        autoModelFailover: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
            take: AI_JOB_POLL_BATCH_SIZE,
        });
    }

    async getStuckJobStats() {
        const cutoff = new Date(Date.now() - AI_JOB_MAX_AGE_MS);
        const [pendingCount, processingCount, staleCount] = await Promise.all([
            this.prismaService.aiGenerationJob.count({
                where: { status: JobStatus.PENDING },
            }),
            this.prismaService.aiGenerationJob.count({
                where: { status: JobStatus.PROCESSING },
            }),
            this.prismaService.aiGenerationJob.count({
                where: {
                    status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
                    createdAt: { lt: cutoff },
                },
            }),
        ]);

        return { pendingCount, processingCount, staleCount };
    }

    async recordPollAttempt(jobId: string, pollError = false) {
        await this.prismaService.aiGenerationJob.update({
            where: { id: jobId },
            data: {
                pollAttempts: { increment: 1 },
                lastPolledAt: new Date(),
                ...(pollError
                    ? { pollErrorCount: { increment: 1 } }
                    : { pollErrorCount: 0 }),
            },
        });
    }

    async failStuckJobs(params: { maxAgeMs?: number; errorMessage: string }) {
        const cutoff = new Date(
            Date.now() - (params.maxAgeMs ?? AI_JOB_MAX_AGE_MS),
        );

        const stuck = await this.prismaService.aiGenerationJob.findMany({
            where: {
                status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
                createdAt: { lt: cutoff },
            },
            include: {
                user: {
                    select: {
                        telegramId: true,
                        language: true,
                        autoModelFailover: true,
                    },
                },
            },
        });

        if (!stuck.length) {
            return [];
        }

        await this.prismaService.aiGenerationJob.updateMany({
            where: { id: { in: stuck.map((job) => job.id) } },
            data: {
                status: JobStatus.FAILED,
                errorMessage: params.errorMessage,
            },
        });

        for (const job of stuck) {
            await this.stripInputFiles(job.id);
        }

        this.logger.warn(
            {
                count: stuck.length,
                jobIds: stuck.map((j) => j.id),
                toolIds: stuck.map((j) => j.toolId),
            },
            'AI jobs auto-failed due to max age',
        );

        return stuck;
    }

    async getJobsNeedingStaleReminder(thresholdMs: number) {
        const cutoff = new Date(Date.now() - thresholdMs);

        return this.prismaService.aiGenerationJob.findMany({
            where: {
                status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
                createdAt: { lt: cutoff },
                staleReminderSent: false,
                notifyTelegram: true,
            },
            include: {
                user: {
                    select: {
                        telegramId: true,
                        language: true,
                        autoModelFailover: true,
                    },
                },
            },
            take: 20,
        });
    }

    async markStaleReminderSent(jobId: string) {
        await this.prismaService.aiGenerationJob.update({
            where: { id: jobId },
            data: { staleReminderSent: true },
        });
    }

    async getCompletedJobForUser(jobId: string, userId: string) {
        return this.prismaService.aiGenerationJob.findFirst({
            where: {
                id: jobId,
                userId,
                status: JobStatus.COMPLETED,
            },
            select: {
                id: true,
                toolId: true,
                providerJobId: true,
                resultUrl: true,
                resultJson: true,
                inputJson: true,
                sessionId: true,
            },
        });
    }

    async updateJobStatus(
        jobId: string,
        status: JobStatus,
        data?: {
            resultUrl?: string;
            resultJson?: unknown;
            errorMessage?: string;
        },
    ) {
        await this.prismaService.aiGenerationJob.update({
            where: { id: jobId },
            data: {
                status,
                resultUrl: data?.resultUrl,
                ...(data?.resultJson !== undefined
                    ? { resultJson: data.resultJson as object }
                    : {}),
                errorMessage: data?.errorMessage,
            },
        });

        if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
            await this.stripInputFiles(jobId);
        }
    }

    async failJobWithRefund(params: {
        jobId: string;
        telegramId: string;
        tokenCost: number;
        errorMessage: string;
    }) {
        await this.updateJobStatus(params.jobId, JobStatus.FAILED, {
            errorMessage: params.errorMessage,
        });

        if (params.tokenCost > 0) {
            await this.tokenBillingService.refund(
                params.telegramId,
                params.tokenCost,
            );
        }
    }
}
