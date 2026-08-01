import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UserModelService } from '@/common/models/user';
import { GptConversationModelService } from '@/common/models/gpt-conversation';
import { getToolById } from '@/common/config/ai-tools.registry';
import { compressGptHistoryImage } from '@/common/utils/compress-reference-image';
import { serializeGptUserMessage } from '@/common/utils/gpt-message-content';
import { isChatAssistantTool } from '@/common/utils/is-chat-assistant-tool';
import { SubscribeType } from '@/generated/prisma/enums';
import {
    AiGenerationInput,
    AiGenerationResult,
    AiService,
    AiToolId,
    TokenBillingService,
} from '@/common/services/ai';
import { AiJobService } from '@/common/services/ai/jobs/ai-job.service';

export type GenerationRequest = {
    userId: string;
    telegramId: string;
    toolId: AiToolId;
    input: AiGenerationInput;
    conversationId?: string;
    promptText?: string;
};

export type GenerationSyncResult = {
    mode: 'sync';
    result: {
        type: AiGenerationResult['type'];
        text?: string;
        url?: string;
        mimeType?: string;
        dataUrl?: string;
    };
    tokenCost: number;
    tokenLeft: number;
    conversationId?: string;
};

export type GenerationAsyncResult = {
    mode: 'async';
    jobId: string;
    tokenCost: number;
    tokenLeft: number;
};

export type GenerationFacadeResult =
    | GenerationSyncResult
    | GenerationAsyncResult;

@Injectable()
export class GenerationFacade {
    constructor(
        private readonly userModelService: UserModelService,
        private readonly aiService: AiService,
        private readonly aiJobService: AiJobService,
        private readonly tokenBillingService: TokenBillingService,
        private readonly gptConversationModelService: GptConversationModelService,
    ) {}

    async generate(params: GenerationRequest): Promise<GenerationFacadeResult> {
        const user = await this.userModelService.getUserByTelegramId(
            params.telegramId,
        );

        if (!user) {
            throw new HttpException(
                { error: 'User not found' },
                HttpStatus.NOT_FOUND,
            );
        }

        if (
            !user.isSubscriptionActive ||
            user.subscribeType === SubscribeType.NOT_SUBSCRIBED
        ) {
            throw new HttpException(
                { error: 'NO_SUBSCRIPTION' },
                HttpStatus.FORBIDDEN,
            );
        }

        const tool = getToolById(params.toolId);
        if (!tool) {
            throw new HttpException(
                { error: 'Unknown tool' },
                HttpStatus.BAD_REQUEST,
            );
        }

        let input = { ...params.input };
        let conversationId = params.conversationId;

        if (isChatAssistantTool(params.toolId)) {
            const conversation =
                await this.gptConversationModelService.getOrCreateActiveConversation(
                    params.userId,
                    params.toolId,
                    conversationId,
                );
            conversationId = conversation.id;
            const history = await this.gptConversationModelService.getMessages(
                conversation.id,
            );
            input = {
                ...input,
                chatHistory: history,
            };
        }

        const tokenCost = this.tokenBillingService.calculateCost(tool, {
            durationSeconds:
                input.durationSeconds ?? tool.defaultDurationSeconds,
            topazScale: input.topazScale,
            quality: input.quality,
            resolution: input.resolution,
        });

        const balanceCheck = await this.tokenBillingService.checkBalance(
            params.telegramId,
            tokenCost,
        );

        if (!balanceCheck.allowed) {
            throw new HttpException(
                { error: 'INSUFFICIENT_TOKENS' },
                HttpStatus.PAYMENT_REQUIRED,
            );
        }

        if (tool.isAsync) {
            const created = await this.aiJobService.createJob({
                userId: params.userId,
                telegramId: params.telegramId,
                toolId: params.toolId,
                input,
            });

            return {
                mode: 'async',
                jobId: created.job.id,
                tokenCost: created.tokenCost,
                tokenLeft: created.balance ?? 0,
            };
        }

        const generationResult = await this.aiService.generate(
            params.toolId,
            input,
        );
        const actualCost = generationResult.actualTokenCost ?? tokenCost;

        const deduct = await this.tokenBillingService.commit(
            params.telegramId,
            actualCost,
        );

        if (!deduct.success) {
            throw new HttpException(
                { error: 'INSUFFICIENT_TOKENS' },
                HttpStatus.PAYMENT_REQUIRED,
            );
        }

        if (
            isChatAssistantTool(params.toolId) &&
            generationResult.text &&
            conversationId
        ) {
            const storedFiles = input.files
                ? await Promise.all(
                      input.files.map((file) => compressGptHistoryImage(file)),
                  )
                : undefined;
            const userContent = serializeGptUserMessage(
                params.promptText ?? input.prompt,
                storedFiles,
            );
            await this.gptConversationModelService.appendMessages(
                conversationId,
                userContent,
                generationResult.text,
            );

            const prompt = params.promptText ?? input.prompt;
            if (prompt?.trim()) {
                await this.gptConversationModelService.setTitleIfDefault(
                    conversationId,
                    this.gptConversationModelService.buildTitleFromPrompt(
                        prompt,
                    ),
                );
            }

            await this.gptConversationModelService.trimOldConversations(
                params.userId,
                params.toolId,
            );
        }

        return {
            mode: 'sync',
            result: this.serializeResult(generationResult),
            tokenCost: actualCost,
            tokenLeft: deduct.balance ?? 0,
            conversationId,
        };
    }

    private serializeResult(result: AiGenerationResult) {
        let dataUrl: string | undefined;
        if (result.buffer && result.mimeType) {
            dataUrl = `data:${result.mimeType};base64,${result.buffer.toString('base64')}`;
        } else if (result.voiceBuffer && result.voiceMimeType) {
            dataUrl = `data:${result.voiceMimeType};base64,${result.voiceBuffer.toString('base64')}`;
        }

        return {
            type: result.type,
            text: result.text,
            url: result.url,
            mimeType: result.mimeType ?? result.voiceMimeType,
            dataUrl,
        };
    }
}
