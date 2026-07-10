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
    OpenRouterProvider,
    SharpiiProvider,
    TopazProvider,
    isElevenLabsDubbingResultUrl,
} from './providers';

@Injectable()
export class AiService {
    constructor(
        private readonly openRouterProvider: OpenRouterProvider,
        private readonly sharpiiProvider: SharpiiProvider,
        private readonly heyGenProvider: HeyGenProvider,
        private readonly higgsfieldProvider: HiggsfieldProvider,
        private readonly topazProvider: TopazProvider,
        private readonly elevenLabsProvider: ElevenLabsProvider,
    ) {}

    async generate(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const tool = getToolById(toolId);
        if (!tool) {
            throw new Error(`Unknown tool: ${toolId}`);
        }

        switch (tool.provider) {
            case AiProviderId.OPENROUTER:
                return this.openRouterProvider.generate(toolId, input);
            case AiProviderId.SHARPII:
                return this.sharpiiProvider.generate(toolId, input);
            case AiProviderId.ELEVENLABS:
                return this.elevenLabsProvider.generate(toolId, input);
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
}
