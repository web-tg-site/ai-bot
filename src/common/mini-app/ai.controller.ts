import {
    Body,
    Controller,
    Get,
    HttpException,
    HttpStatus,
    Param,
    Patch,
    Post,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
    IsEnum,
    IsIn,
    IsNumberString,
    IsOptional,
    IsString,
} from 'class-validator';
import { CurrentUser, TelegramJwtGuard } from '@/common/auth';
import type { CurrentUserPayload } from '@/common/auth';
import { PrismaService } from '@/common/services/prisma';
import type { AiFileInput } from '@/common/services/ai/types';
import { AiToolId } from '@/common/services/ai/types';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import { ELEVENLABS_VOICE_CATALOG } from '@/common/config/elevenlabs-voices.config';
import {
    getToolById,
    AI_TOOLS_REGISTRY,
} from '@/common/config/ai-tools.registry';
import { GenerationFacade } from './generation.facade';

const uploadInterceptor = FilesInterceptor('files', 10, {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});

class GenerateBodyDto {
    @IsEnum(AiToolId)
    toolId!: AiToolId;

    @IsOptional()
    @IsString()
    prompt?: string;

    @IsOptional()
    @IsString()
    conversationId?: string;

    @IsOptional()
    @IsString()
    aspectRatio?: string;

    @IsOptional()
    @IsString()
    resolution?: string;

    @IsOptional()
    @IsString()
    quality?: string;

    @IsOptional()
    @IsNumberString()
    durationSeconds?: string;

    @IsOptional()
    @IsNumberString()
    topazScale?: string;

    @IsOptional()
    @IsString()
    videoStyleId?: string;

    @IsOptional()
    @IsString()
    elevenLabsVoiceId?: string;

    @IsOptional()
    @IsString()
    gptWebSearch?: string;

    @IsOptional()
    @IsIn(['text', 'audio', 'both'])
    gptReplyMode?: 'text' | 'audio' | 'both';
}

@Controller('api/ai')
@UseGuards(TelegramJwtGuard)
export class AiController {
    constructor(
        private readonly generationFacade: GenerationFacade,
        private readonly prismaService: PrismaService,
        private readonly userAiToolSettingsModelService: UserAiToolSettingsModelService,
    ) {}

    @Get('tools')
    listTools() {
        return AI_TOOLS_REGISTRY.map((tool) => ({
            id: tool.id,
            category: tool.category,
            isAsync: tool.isAsync,
            baseTokenCost: tool.baseTokenCost,
            defaultDurationSeconds: tool.defaultDurationSeconds,
        }));
    }

    @Get('voices')
    listVoices() {
        return ELEVENLABS_VOICE_CATALOG.map((voice) => ({
            id: voice.id,
            labelRu: voice.labelRu,
            labelEn: voice.labelEn,
        }));
    }

    @Get('tools/:toolId/settings')
    async getSettings(
        @CurrentUser() current: CurrentUserPayload,
        @Param('toolId') toolId: string,
    ) {
        this.assertToolId(toolId);
        const id = toolId;

        if (this.isVideoTool(id)) {
            return this.userAiToolSettingsModelService.getVideoSettings(
                current.id,
                id,
            );
        }

        if (this.isVoiceTool(id)) {
            return this.userAiToolSettingsModelService.getVoiceSettings(
                current.id,
                id,
            );
        }

        return this.userAiToolSettingsModelService.getSettings(current.id, id);
    }

    @Patch('tools/:toolId/settings')
    async patchSettings(
        @CurrentUser() current: CurrentUserPayload,
        @Param('toolId') toolId: string,
        @Body() body: Record<string, unknown>,
    ) {
        this.assertToolId(toolId);
        const id = toolId;

        if (this.isVideoTool(id)) {
            return this.userAiToolSettingsModelService.upsertVideoSettings(
                current.id,
                id,
                body,
            );
        }

        if (this.isVoiceTool(id)) {
            return this.userAiToolSettingsModelService.upsertVoiceSettings(
                current.id,
                id,
                body,
            );
        }

        return this.userAiToolSettingsModelService.upsertSettings(
            current.id,
            id,
            body,
        );
    }

    @Post('generate')
    @UseInterceptors(uploadInterceptor)
    async generate(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: GenerateBodyDto,
        @UploadedFiles() files?: Express.Multer.File[],
    ) {
        const fileInputs: AiFileInput[] | undefined = files?.length
            ? files.map((file) => ({
                  buffer: file.buffer,
                  mimeType: file.mimetype,
                  fileName: file.originalname,
              }))
            : undefined;

        try {
            return await this.generationFacade.generate({
                userId: current.id,
                telegramId: current.telegramId,
                toolId: body.toolId,
                conversationId: body.conversationId,
                promptText: body.prompt,
                input: {
                    prompt: body.prompt,
                    files: fileInputs,
                    aspectRatio: body.aspectRatio,
                    resolution: body.resolution,
                    quality: body.quality,
                    durationSeconds: body.durationSeconds
                        ? Number(body.durationSeconds)
                        : undefined,
                    topazScale: body.topazScale
                        ? Number(body.topazScale)
                        : undefined,
                    videoStyleId: body.videoStyleId,
                    elevenLabsVoiceId: body.elevenLabsVoiceId,
                    gptWebSearch:
                        body.gptWebSearch === 'true' ||
                        body.gptWebSearch === '1',
                    gptReplyMode: body.gptReplyMode,
                },
            });
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            const message =
                error instanceof Error ? error.message : 'Generation failed';

            if (message === 'INSUFFICIENT_TOKENS') {
                throw new HttpException(
                    { error: 'INSUFFICIENT_TOKENS' },
                    HttpStatus.PAYMENT_REQUIRED,
                );
            }

            throw new HttpException({ error: message }, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('jobs')
    async listJobs(@CurrentUser() current: CurrentUserPayload) {
        const jobs = await this.prismaService.aiGenerationJob.findMany({
            where: { userId: current.id },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: {
                id: true,
                toolId: true,
                status: true,
                resultUrl: true,
                errorMessage: true,
                tokenCost: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return { items: jobs };
    }

    @Get('jobs/:jobId')
    async getJob(
        @CurrentUser() current: CurrentUserPayload,
        @Param('jobId') jobId: string,
    ) {
        const job = await this.prismaService.aiGenerationJob.findFirst({
            where: { id: jobId, userId: current.id },
            select: {
                id: true,
                toolId: true,
                status: true,
                resultUrl: true,
                errorMessage: true,
                tokenCost: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!job) {
            throw new HttpException(
                { error: 'Job not found' },
                HttpStatus.NOT_FOUND,
            );
        }

        return job;
    }

    private assertToolId(toolId: string): asserts toolId is AiToolId {
        if (!getToolById(toolId as AiToolId)) {
            throw new HttpException(
                { error: 'Unknown tool' },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    private isVideoTool(toolId: AiToolId) {
        const tool = getToolById(toolId);
        return tool?.category === 'video';
    }

    private isVoiceTool(toolId: AiToolId) {
        const tool = getToolById(toolId);
        return tool?.category === 'audio' || toolId === AiToolId.VIDEO_TO_AUDIO;
    }
}
