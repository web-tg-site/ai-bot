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
                inputJson: params.input,
                notifyTelegram: params.notifyTelegram ?? true,
                sessionId: params.sessionId ?? null,
            },
        });

        return { job, tokenCost, balance: deductResult.balance };
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
    }) {
        return this.prismaService.aiGenerationJob.create({
            data: {
                userId: params.userId,
                toolId: params.toolId,
                status: JobStatus.COMPLETED,
                tokenCost: params.tokenCost,
                inputJson: params.input,
                resultUrl: params.resultUrl ?? null,
                notifyTelegram: params.notifyTelegram ?? true,
                sessionId: params.sessionId ?? null,
            },
        });
    }

    async getPendingJobs() {
        return this.prismaService.aiGenerationJob.findMany({
            where: {
                status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
            },
            include: {
                user: { select: { telegramId: true, language: true } },
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
                user: { select: { telegramId: true, language: true } },
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
                user: { select: { telegramId: true, language: true } },
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
