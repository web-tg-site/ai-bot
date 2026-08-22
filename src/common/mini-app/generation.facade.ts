import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UserModelService } from '@/common/models/user';
import { GptConversationModelService } from '@/common/models/gpt-conversation';
import { getToolById } from '@/common/config/ai-tools.registry';
import { isVideoFlowTool } from '@/common/config/video-editor-capabilities.config';
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
import { VideoCapabilitiesService } from '@/common/services/ai/video-capabilities.service';

export type GenerationRequest = {
    userId: string;
    telegramId: string;
    toolId: AiToolId;
    input: AiGenerationInput;
    conversationId?: string;
    sessionId?: string;
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
        images?: string[];
    };
    tokenCost: number;
    tokenLeft: number;
    conversationId?: string;
    jobId?: string;
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
        private readonly videoCapabilitiesService: VideoCapabilitiesService,
    ) {}

    async generate(params: GenerationRequest): Promise<GenerationFacadeResult> {
        const user = await this.userModelService.getUserByTelegramId(
            params.telegramId,
        );

        if (!user) {
            throw new HttpException(
                { error: 'Пользователь не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        if (
            !user.isSubscriptionActive ||
            user.subscribeType === SubscribeType.NOT_SUBSCRIBED
        ) {
            throw new HttpException(
                {
                    error: 'NO_SUBSCRIPTION',
                    message: 'Нужна активная подписка',
                },
                HttpStatus.FORBIDDEN,
            );
        }

        const tool = getToolById(params.toolId);
        if (!tool) {
            throw new HttpException(
                { error: 'Неизвестный инструмент' },
                HttpStatus.BAD_REQUEST,
            );
        }

        let input = { ...params.input };
        let conversationId = params.conversationId;

        let effectiveToolId = params.toolId;

        if (isChatAssistantTool(params.toolId)) {
            const conversation =
                await this.gptConversationModelService.getOrCreateActiveConversation(
                    params.userId,
                    params.toolId,
                    conversationId,
                );
            conversationId = conversation.id;
            // Conversation row is source of truth for which assistant runs.
            effectiveToolId = conversation.toolId as AiToolId;
            const history = await this.gptConversationModelService.getMessages(
                conversation.id,
            );
            input = {
                ...input,
                chatHistory: history,
            };
        }

        if (isVideoFlowTool(effectiveToolId) && input.videoStyleId) {
            input = this.applyVideoStyle(effectiveToolId, input);
        }

        const toolForBilling = getToolById(effectiveToolId) ?? tool;

        const tokenCost = this.tokenBillingService.calculateCost(
            toolForBilling,
            {
                durationSeconds:
                    input.durationSeconds ??
                    toolForBilling.defaultDurationSeconds,
                topazScale: input.topazScale,
                quality: input.quality,
                resolution: input.resolution,
            },
        );

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

        if (toolForBilling.isAsync) {
            const created = await this.aiJobService.createJob({
                userId: params.userId,
                telegramId: params.telegramId,
                toolId: effectiveToolId,
                input,
                // Mini-app shows results in-app; do not mirror to Telegram chat.
                notifyTelegram: false,
                sessionId: params.sessionId,
            });

            return {
                mode: 'async',
                jobId: created.job.id,
                tokenCost: created.tokenCost,
                tokenLeft: created.balance ?? 0,
            };
        }

        const generationResult = await this.aiService.generate(
            effectiveToolId,
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
            isChatAssistantTool(effectiveToolId) &&
            conversationId &&
            (generationResult.text || generationResult.images?.length)
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
                generationResult.text || '[image]',
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
                effectiveToolId,
            );
        }

        const serialized = this.serializeResult(generationResult);
        let jobId: string | undefined;

        // Media/audio sync tools previously left no DB trail — history only
        // existed for GPT chats and async jobs.
        if (!isChatAssistantTool(effectiveToolId)) {
            const resultUrl = serialized.url ?? serialized.dataUrl ?? null;
            if (resultUrl) {
                const recorded = await this.aiJobService.recordCompletedJob({
                    userId: params.userId,
                    toolId: effectiveToolId,
                    input,
                    resultUrl,
                    tokenCost: actualCost,
                    notifyTelegram: false,
                    sessionId: params.sessionId,
                });
                jobId = recorded.id;
            }
        }

        return {
            mode: 'sync',
            result: serialized,
            tokenCost: actualCost,
            tokenLeft: deduct.balance ?? 0,
            conversationId,
            jobId,
        };
    }

    private applyVideoStyle(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): AiGenerationInput {
        const styleOption = this.videoCapabilitiesService.resolveStyleOption(
            toolId,
            input.videoStyleId,
        );

        let prompt = input.prompt;
        if (styleOption.source === 'builtin' && styleOption.promptSuffix) {
            const trimmed = prompt?.trim();
            prompt = trimmed
                ? `${trimmed}. ${styleOption.promptSuffix}`
                : styleOption.promptSuffix;
        }

        return {
            ...input,
            prompt,
            videoStylePassthrough: styleOption.passthrough,
        };
    }

    private serializeResult(result: AiGenerationResult) {
        let dataUrl: string | undefined;
        if (result.buffer && result.mimeType) {
            dataUrl = `data:${result.mimeType};base64,${result.buffer.toString('base64')}`;
        } else if (result.voiceBuffer && result.voiceMimeType) {
            dataUrl = `data:${result.voiceMimeType};base64,${result.voiceBuffer.toString('base64')}`;
        }

        const images = result.images?.map(
            (image) =>
                `data:${image.mimeType || 'image/png'};base64,${image.buffer.toString('base64')}`,
        );

        return {
            type: result.type,
            text: result.text,
            url: result.url,
            mimeType: result.mimeType ?? result.voiceMimeType,
            dataUrl,
            images,
        };
    }
}
