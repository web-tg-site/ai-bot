import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/services/prisma';
import { JobStatus } from '@/generated/prisma/enums';
import { AiService } from '../ai.service';
import { AiGenerationInput, AiToolId } from '../types';
import { getToolById } from '@/common/config/ai-tools.registry';
import { TokenBillingService } from '../billing/token-billing.service';

@Injectable()
export class AiJobService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly aiService: AiService,
        private readonly tokenBillingService: TokenBillingService,
    ) {}

    async createJob(params: {
        userId: string;
        telegramId: string;
        toolId: AiToolId;
        input: AiGenerationInput;
    }) {
        const tool = getToolById(params.toolId);
        if (!tool) {
            throw new Error(`Unknown tool: ${params.toolId}`);
        }

        const tokenCost = this.tokenBillingService.calculateCost(
            tool,
            params.input.durationSeconds,
        );

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
            },
        });

        return { job, tokenCost, balance: deductResult.balance };
    }

    async getPendingJobs() {
        return this.prismaService.aiGenerationJob.findMany({
            where: {
                status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
            },
            include: {
                user: { select: { telegramId: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: 50,
        });
    }

    async updateJobStatus(
        jobId: string,
        status: JobStatus,
        data?: { resultUrl?: string; errorMessage?: string },
    ) {
        await this.prismaService.aiGenerationJob.update({
            where: { id: jobId },
            data: {
                status,
                resultUrl: data?.resultUrl,
                errorMessage: data?.errorMessage,
            },
        });
    }
}
