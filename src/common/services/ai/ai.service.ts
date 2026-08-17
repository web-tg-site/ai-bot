import { Injectable } from '@nestjs/common';
import { getToolById } from '@/common/config/ai-tools.registry';
import {
    AiGenerationInput,
    AiGenerationResult,
    AiJobCreateResult,
    AiJobStatusResult,
    AiProviderId,
    AiToolId,
} from './types';
import {
    ElevenLabsProvider,
    HiggsfieldProvider,
    HeyGenProvider,
    OpenAiProvider,
    OpenRouterProvider,
    SharpiiProvider,
    TopazProvider,
    BflProvider,
    LumaProvider,
    isElevenLabsDubbingResultUrl,
} from './providers';

@Injectable()
export class AiService {
    constructor(
        private readonly openAiProvider: OpenAiProvider,
        private readonly openRouterProvider: OpenRouterProvider,
        private readonly sharpiiProvider: SharpiiProvider,
        private readonly heyGenProvider: HeyGenProvider,
        private readonly higgsfieldProvider: HiggsfieldProvider,
        private readonly topazProvider: TopazProvider,
        private readonly elevenLabsProvider: ElevenLabsProvider,
        private readonly bflProvider: BflProvider,
        private readonly lumaProvider: LumaProvider,
    ) {}

    async listAccessibleElevenLabsVoices() {
        return this.elevenLabsProvider.listAccessibleVoices();
    }

    async listHiggsfieldMotions() {
        return this.higgsfieldProvider.listMotions();
    }

    async listHeyGenVoices(options?: { language?: string; gender?: string }) {
        return this.heyGenProvider.listPublicVoices(options);
    }

    async listHeyGenAvatars() {
        return this.heyGenProvider.listPublicLooks();
    }

    async generate(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const tool = getToolById(toolId);
        if (!tool) {
            throw new Error(`Unknown tool: ${toolId}`);
        }

        switch (tool.provider) {
            case AiProviderId.OPENAI:
                return this.openAiProvider.generate(toolId, input);
            case AiProviderId.OPENROUTER:
                return this.openRouterProvider.generate(toolId, input);
            case AiProviderId.SHARPII:
                return this.sharpiiProvider.generate(toolId, input);
            case AiProviderId.ELEVENLABS:
                return this.elevenLabsProvider.generate(toolId, input);
            case AiProviderId.BFL:
                throw new Error(
                    `Sync generation not supported for BFL — use async job`,
                );
            case AiProviderId.LUMA:
                throw new Error(
                    `Sync generation not supported for Luma — use async job`,
                );
            default:
                throw new Error(
                    `Sync generation not supported for provider ${String(tool.provider)}`,
                );
        }
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const tool = getToolById(toolId);
        if (!tool) {
            throw new Error(`Unknown tool: ${toolId}`);
        }

        switch (tool.provider) {
            case AiProviderId.OPENROUTER:
                return this.openRouterProvider.createJob(toolId, input);
            case AiProviderId.SHARPII:
                return this.sharpiiProvider.createJob(toolId, input);
            case AiProviderId.ELEVENLABS:
                return this.elevenLabsProvider.createJob(toolId, input);
            case AiProviderId.HEYGEN:
                return this.heyGenProvider.createJob(toolId, input);
            case AiProviderId.HIGGSFIELD:
                return this.higgsfieldProvider.createJob(input);
            case AiProviderId.TOPAZ:
                return this.topazProvider.createJob(input);
            case AiProviderId.BFL:
                return this.bflProvider.createJob(toolId, input);
            case AiProviderId.LUMA:
                return this.lumaProvider.createJob(toolId, input);
            default:
                throw new Error(
                    `Async generation not supported for provider ${String(tool.provider)}`,
                );
        }
    }

    async getJobStatus(
        toolId: AiToolId,
        providerJobId: string,
    ): Promise<AiJobStatusResult> {
        const tool = getToolById(toolId);
        if (!tool) {
            throw new Error(`Unknown tool: ${toolId}`);
        }

        switch (tool.provider) {
            case AiProviderId.OPENROUTER:
                return this.openRouterProvider.getJobStatus(providerJobId);
            case AiProviderId.SHARPII:
                return this.sharpiiProvider.getJobStatus(providerJobId, toolId);
            case AiProviderId.ELEVENLABS:
                return this.elevenLabsProvider.getJobStatus(providerJobId);
            case AiProviderId.HEYGEN:
                return this.heyGenProvider.getJobStatus(providerJobId);
            case AiProviderId.HIGGSFIELD:
                return this.higgsfieldProvider.getJobStatus(providerJobId);
            case AiProviderId.TOPAZ:
                return this.topazProvider.getJobStatus(providerJobId);
            case AiProviderId.BFL:
                return this.bflProvider.getJobStatus(providerJobId);
            case AiProviderId.LUMA:
                return this.lumaProvider.getJobStatus(providerJobId);
            default:
                throw new Error(
                    `Job status not supported for provider ${String(tool.provider)}`,
                );
        }
    }

    async resolveResultForDelivery(
        toolId: AiToolId,
        providerJobId: string,
        result: AiGenerationResult,
    ): Promise<AiGenerationResult> {
        const tool = getToolById(toolId);
        if (
            tool?.provider === AiProviderId.ELEVENLABS &&
            isElevenLabsDubbingResultUrl(result.url)
        ) {
            return this.elevenLabsProvider.downloadDubbingResult(
                providerJobId,
                result,
            );
        }

        return result;
    }

    async generateViaAsyncJob(
        toolId: AiToolId,
        input: AiGenerationInput,
        options?: { maxWaitMs?: number; pollIntervalMs?: number },
    ): Promise<AiGenerationResult> {
        const maxWaitMs = options?.maxWaitMs ?? 180_000;
        const pollIntervalMs = options?.pollIntervalMs ?? 2_000;

        const { providerJobId } = await this.createJob(toolId, input);
        const deadline = Date.now() + maxWaitMs;

        while (Date.now() < deadline) {
            const status = await this.getJobStatus(toolId, providerJobId);

            if (status.status === 'completed' && status.result) {
                return this.resolveResultForDelivery(
                    toolId,
                    providerJobId,
                    status.result,
                );
            }

            if (status.status === 'failed') {
                throw new Error(status.errorMessage ?? 'Генерация не удалась');
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        throw new Error('Превышено время ожидания генерации');
    }
}
