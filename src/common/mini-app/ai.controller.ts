import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    Res,
    StreamableFile,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
    IsEnum,
    IsIn,
    IsNumberString,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';
import { CurrentUser, TelegramJwtGuard } from '@/common/auth';
import type { CurrentUserPayload } from '@/common/auth';
import { PrismaService } from '@/common/services/prisma';
import type { AiFileInput } from '@/common/services/ai/types';
import { AiToolId } from '@/common/services/ai/types';
import { JobStatus } from '@/generated/prisma/enums';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import {
    getToolById,
    AI_TOOLS_REGISTRY,
} from '@/common/config/ai-tools.registry';
import {
    downloadRemoteFile,
    getAuthHeadersForUrl,
} from '@/common/utils/download-remote-file';
import { parseDataUrl } from '@/common/utils/parse-data-url';
import { ElevenLabsProvider } from '@/common/services/ai/providers/elevenlabs.provider';
import {
    ELEVENLABS_DUBBING_RESULT_PREFIX,
    isElevenLabsDubbingResultUrl,
} from '@/common/services/ai/providers/elevenlabs.provider';
import { ElevenLabsVoicePreviewService } from '@/common/services/elevenlabs-voice-preview';
import { GenerationFacade } from './generation.facade';
import { ModuleRef } from '@nestjs/core';
import { BotService } from '@/common/services/bot';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const uploadInterceptor = FilesInterceptor('files', 10, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
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

class SavedPromptBodyDto {
    @IsString()
    @MinLength(1)
    @MaxLength(8000)
    prompt!: string;

    @IsOptional()
    @IsString()
    toolId?: string;
}

@Controller('api/ai')
@UseGuards(TelegramJwtGuard)
export class AiController {
    constructor(
        private readonly generationFacade: GenerationFacade,
        private readonly prismaService: PrismaService,
        private readonly userAiToolSettingsModelService: UserAiToolSettingsModelService,
        private readonly elevenLabsProvider: ElevenLabsProvider,
        private readonly elevenLabsVoicePreviewService: ElevenLabsVoicePreviewService,
        private readonly moduleRef: ModuleRef,
    ) {}

    @Get('tools')
    listTools() {
        return AI_TOOLS_REGISTRY.map((tool) => ({
            id: tool.id,
            category: tool.category,
            isAsync: tool.isAsync,
            baseTokenCost: tool.baseTokenCost,
            perSecondCost: tool.perSecondCost ?? null,
            defaultDurationSeconds: tool.defaultDurationSeconds,
            label: tool.label,
        }));
    }

    @Get('voices')
    async listVoices() {
        const voices = await this.elevenLabsProvider.listAccessibleVoices();
        return voices.map((voice) => ({
            id: voice.id,
            labelRu: voice.labelRu,
            labelEn: voice.labelEn,
            gender: voice.gender ?? null,
            previewUrl: voice.previewUrl ?? null,
        }));
    }

    @Get('voices/:voiceId/preview')
    async getVoicePreview(
        @Param('voiceId') voiceId: string,
        @Query('locale') locale: string | undefined,
        @Res({ passthrough: true }) res: Response,
    ) {
        const trimmed = voiceId?.trim();
        if (!trimmed) {
            throw new HttpException(
                { error: 'Voice id required' },
                HttpStatus.BAD_REQUEST,
            );
        }

        const localeTag =
            locale === 'en-US' || locale === 'en' ? 'en-US' : 'ru-RU';

        try {
            const buffer =
                await this.elevenLabsVoicePreviewService.getOrCreatePreview(
                    trimmed,
                    localeTag,
                );
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'private, max-age=86400');
            return new StreamableFile(buffer);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Voice preview failed';
            throw new HttpException({ error: message }, HttpStatus.BAD_GATEWAY);
        }
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
            ? await Promise.all(
                  files.map(async (file) =>
                      compressReferenceImage({
                          buffer: file.buffer,
                          mimeType: file.mimetype,
                          fileName: file.originalname,
                      }),
                  ),
              )
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
    async listJobs(
        @CurrentUser() current: CurrentUserPayload,
        @Query('toolId') toolId?: string,
        @Query('category') category?: string,
    ) {
        if (toolId) {
            this.assertToolId(toolId);
        }

        const categoryToolIds =
            category === 'image' ||
            category === 'video' ||
            category === 'audio' ||
            category === 'text'
                ? AI_TOOLS_REGISTRY.filter(
                      (tool) =>
                          tool.category === category ||
                          (category === 'image' && tool.id === AiToolId.TOPAZ),
                  ).map((tool) => tool.id)
                : undefined;

        const jobs = await this.prismaService.aiGenerationJob.findMany({
            where: {
                userId: current.id,
                ...(toolId ? { toolId } : {}),
                ...(categoryToolIds && !toolId
                    ? { toolId: { in: categoryToolIds } }
                    : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: {
                id: true,
                toolId: true,
                status: true,
                resultUrl: true,
                errorMessage: true,
                tokenCost: true,
                inputJson: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return {
            items: jobs.map((job) => {
                const input = job.inputJson as { prompt?: string } | null;
                return {
                    id: job.id,
                    toolId: job.toolId,
                    status: job.status,
                    hasResult: Boolean(job.resultUrl),
                    errorMessage: job.errorMessage,
                    tokenCost: job.tokenCost,
                    prompt: input?.prompt ?? '',
                    createdAt: job.createdAt,
                    updatedAt: job.updatedAt,
                };
            }),
        };
    }

    @Delete('jobs')
    async clearJobs(
        @CurrentUser() current: CurrentUserPayload,
        @Query('category') category?: string,
        @Query('toolId') toolId?: string,
    ) {
        if (toolId) {
            this.assertToolId(toolId);
        }

        const categoryToolIds =
            category === 'image' ||
            category === 'video' ||
            category === 'audio' ||
            category === 'text'
                ? AI_TOOLS_REGISTRY.filter(
                      (tool) =>
                          tool.category === category ||
                          (category === 'image' && tool.id === AiToolId.TOPAZ),
                  ).map((tool) => tool.id)
                : undefined;

        const result = await this.prismaService.aiGenerationJob.deleteMany({
            where: {
                userId: current.id,
                ...(toolId ? { toolId } : {}),
                ...(categoryToolIds && !toolId
                    ? { toolId: { in: categoryToolIds } }
                    : {}),
            },
        });

        return { deleted: result.count };
    }

    @Get('saved-prompts')
    async listSavedPrompts(
        @CurrentUser() current: CurrentUserPayload,
        @Query('toolId') toolId?: string,
    ) {
        if (toolId) {
            this.assertToolId(toolId);
        }

        const items = await this.prismaService.savedPrompt.findMany({
            where: {
                userId: current.id,
                ...(toolId ? { toolId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                id: true,
                toolId: true,
                prompt: true,
                createdAt: true,
            },
        });

        return { items };
    }

    @Post('saved-prompts')
    async createSavedPrompt(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: SavedPromptBodyDto,
    ) {
        const trimmed = body.prompt.trim();
        if (!trimmed) {
            throw new HttpException(
                { error: 'Prompt required' },
                HttpStatus.BAD_REQUEST,
            );
        }

        if (body.toolId) {
            this.assertToolId(body.toolId);
        }

        const item = await this.prismaService.savedPrompt.create({
            data: {
                userId: current.id,
                toolId: body.toolId ?? null,
                prompt: trimmed,
            },
            select: {
                id: true,
                toolId: true,
                prompt: true,
                createdAt: true,
            },
        });

        return item;
    }

    @Delete('saved-prompts/:id')
    async deleteSavedPrompt(
        @CurrentUser() current: CurrentUserPayload,
        @Param('id') id: string,
    ) {
        const existing = await this.prismaService.savedPrompt.findFirst({
            where: { id, userId: current.id },
            select: { id: true },
        });

        if (!existing) {
            throw new HttpException(
                { error: 'Prompt not found' },
                HttpStatus.NOT_FOUND,
            );
        }

        await this.prismaService.savedPrompt.delete({ where: { id } });
        return { ok: true };
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
                inputJson: true,
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

        const input = job.inputJson as { prompt?: string } | null;

        return {
            id: job.id,
            toolId: job.toolId,
            status: job.status,
            hasResult: Boolean(job.resultUrl),
            errorMessage: job.errorMessage,
            tokenCost: job.tokenCost,
            prompt: input?.prompt ?? '',
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        };
    }

    @Post('jobs/:jobId/send')
    async sendJobToTelegram(
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
                providerJobId: true,
            },
        });

        if (!job || job.status !== JobStatus.COMPLETED || !job.resultUrl) {
            throw new HttpException(
                { error: 'Media not found' },
                HttpStatus.NOT_FOUND,
            );
        }

        const { buffer, mimeType } = await this.resolveJobMedia(
            job.resultUrl,
            job.providerJobId,
            job.toolId as AiToolId,
        );
        const type = this.resolveMediaType(job.toolId as AiToolId, mimeType);

        try {
            const botService = this.moduleRef.get(BotService, {
                strict: false,
            });
            if (type === 'video') {
                await botService.sendVideoBuffer(
                    current.telegramId,
                    buffer,
                    mimeType,
                );
            } else if (type === 'audio') {
                await botService.sendAudioBuffer(
                    current.telegramId,
                    buffer,
                    mimeType,
                    true,
                );
            } else {
                let photoSent = false;
                try {
                    await botService.sendPhotoBuffer(
                        current.telegramId,
                        buffer,
                        mimeType,
                        false,
                    );
                    photoSent = true;
                } catch {
                    // continue — document delivery is the reliable path
                }

                try {
                    await botService.sendPhotoBuffer(
                        current.telegramId,
                        buffer,
                        mimeType,
                        true,
                    );
                } catch (fileError) {
                    if (photoSent) {
                        await botService.sendMessage(
                            current.telegramId,
                            '⚠️ Фото отправлено, но файл не удалось отправить',
                        );
                        return { ok: true };
                    }
                    const message =
                        fileError instanceof Error
                            ? fileError.message
                            : 'Send failed';
                    throw new Error(message);
                }

                await botService.sendMessage(
                    current.telegramId,
                    photoSent
                        ? '✅ Фото и файл из мини-приложения'
                        : '✅ Файл из мини-приложения (фото не удалось отправить — слишком большое)',
                );
                return { ok: true };
            }
            await botService.sendMessage(
                current.telegramId,
                '✅ Файл из мини-приложения',
            );
            return { ok: true };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Send failed';
            throw new HttpException({ error: message }, HttpStatus.BAD_GATEWAY);
        }
    }

    @Get('jobs/:jobId/media')
    async getJobMedia(
        @CurrentUser() current: CurrentUserPayload,
        @Param('jobId') jobId: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const job = await this.prismaService.aiGenerationJob.findFirst({
            where: { id: jobId, userId: current.id },
            select: {
                resultUrl: true,
                status: true,
                providerJobId: true,
                toolId: true,
            },
        });

        if (!job?.resultUrl || job.status !== JobStatus.COMPLETED) {
            throw new HttpException(
                { error: 'Media not found' },
                HttpStatus.NOT_FOUND,
            );
        }

        try {
            const { buffer, mimeType } = await this.resolveJobMedia(
                job.resultUrl,
                job.providerJobId,
                job.toolId as AiToolId,
            );
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            const ext = mimeType.startsWith('video/')
                ? 'mp4'
                : mimeType.startsWith('audio/')
                  ? 'mp3'
                  : mimeType.includes('png')
                    ? 'png'
                    : 'jpg';
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="generation-${jobId.slice(0, 8)}.${ext}"`,
            );
            return new StreamableFile(buffer);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Media download failed';
            throw new HttpException({ error: message }, HttpStatus.BAD_GATEWAY);
        }
    }

    private async resolveJobMedia(
        resultUrl: string,
        providerJobId: string | null,
        toolId: AiToolId,
    ): Promise<{ buffer: Buffer; mimeType: string }> {
        const dataUrl = parseDataUrl(resultUrl);
        if (dataUrl) {
            return { buffer: dataUrl.buffer, mimeType: dataUrl.mimeType };
        }

        if (isElevenLabsDubbingResultUrl(resultUrl) && providerJobId) {
            const parsed = this.parseElevenLabsDubbingUrl(resultUrl);
            const downloaded =
                await this.elevenLabsProvider.downloadDubbingResult(
                    providerJobId,
                    {
                        type: parsed.mimeType.startsWith('video/')
                            ? 'video'
                            : 'audio',
                        url: resultUrl,
                        mimeType: parsed.mimeType,
                    },
                );
            if (!downloaded.buffer || !downloaded.mimeType) {
                throw new Error('Empty dubbing result');
            }
            return {
                buffer: downloaded.buffer,
                mimeType: downloaded.mimeType,
            };
        }

        return downloadRemoteFile(
            resultUrl,
            getAuthHeadersForUrl(resultUrl),
        );
    }

    private parseElevenLabsDubbingUrl(url: string): { mimeType: string } {
        const raw = url.slice(ELEVENLABS_DUBBING_RESULT_PREFIX.length);
        const parts = raw.split('/');
        const encodedMime = parts[2] ?? 'audio/mpeg';
        try {
            return { mimeType: decodeURIComponent(encodedMime) };
        } catch {
            return { mimeType: 'audio/mpeg' };
        }
    }

    private resolveMediaType(
        toolId: AiToolId,
        mimeType: string,
    ): 'image' | 'video' | 'audio' {
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (this.isVideoTool(toolId)) return 'video';
        if (this.isVoiceTool(toolId)) return 'audio';
        return 'image';
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
