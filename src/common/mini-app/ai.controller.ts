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
    Req,
    Res,
    StreamableFile,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
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
import type {
    AiFileInput,
    AiGenerationInput,
} from '@/common/services/ai/types';
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
    streamRemoteFile,
} from '@/common/utils/download-remote-file';
import {
    buildOpenAiVideoResultUrl,
    isOpenAiVideoResultUrl,
    OpenAiProvider,
} from '@/common/services/ai/providers/openai.provider';
import { parseDataUrl } from '@/common/utils/parse-data-url';
import { ElevenLabsProvider } from '@/common/services/ai/providers/elevenlabs.provider';
import {
    getElevenLabsAgeLabel,
    getElevenLabsUseCaseLabel,
} from '@/common/config/elevenlabs-voices.config';
import {
    ELEVENLABS_DUBBING_RESULT_PREFIX,
    isElevenLabsDubbingResultUrl,
} from '@/common/services/ai/providers/elevenlabs.provider';
import { HiggsfieldProvider } from '@/common/services/ai/providers/higgsfield.provider';
import { HeyGenProvider } from '@/common/services/ai/providers/heygen.provider';
import { BytePlusProvider } from '@/common/services/ai/providers/byteplus.provider';
import { TempPublicMediaService } from '@/common/services/ai/temp-public-media.service';
import { ElevenLabsVoicePreviewService } from '@/common/services/elevenlabs-voice-preview';
import { GenerationFacade } from './generation.facade';
import { ModuleRef } from '@nestjs/core';
import { BotService } from '@/common/services/bot';
import { SoraCharactersService } from '@/common/services/ai/sora-characters.service';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';
import { normalizeUploadMime } from '@/common/utils/normalize-upload-mime';
import { getI18n, getToolLabel } from '@/common/services/bot/i18n';
import { toUserFacingError } from '@/common/services/bot/errors/bot-error.mapper';

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
    sessionId?: string;

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
    higgsfieldMotionId?: string;

    @IsOptional()
    @IsString()
    elevenLabsVoiceId?: string;

    @IsOptional()
    @IsString()
    heygenVoiceId?: string;

    @IsOptional()
    @IsString()
    heygenAvatarId?: string;

    @IsOptional()
    @IsIn(['avatar_iii', 'avatar_iv', 'avatar_v'])
    heygenEngine?: 'avatar_iii' | 'avatar_iv' | 'avatar_v';

    @IsOptional()
    @IsString()
    heygenCaptions?: string;

    @IsOptional()
    @IsIn(['default', 'remove', 'color'])
    heygenBackgroundMode?: 'default' | 'remove' | 'color';

    @IsOptional()
    @IsString()
    heygenBackgroundColor?: string;

    @IsOptional()
    @IsIn(['low', 'medium', 'high'])
    heygenExpressiveness?: 'low' | 'medium' | 'high';

    @IsOptional()
    @IsString()
    heygenMotionPrompt?: string;

    @IsOptional()
    @IsNumberString()
    heygenVoiceSpeed?: string;

    @IsOptional()
    @IsNumberString()
    heygenVoicePitch?: string;

    @IsOptional()
    @IsString()
    gptWebSearch?: string;

    @IsOptional()
    @IsIn(['text', 'audio', 'both'])
    gptReplyMode?: 'text' | 'audio' | 'both';

    @IsOptional()
    @IsString()
    sunoGenreId?: string;

    @IsOptional()
    @IsString()
    sunoMoodId?: string;

    @IsOptional()
    @IsString()
    sunoInstrumental?: string;

    @IsOptional()
    @IsString()
    sunoLyrics?: string;

    @IsOptional()
    @IsNumberString()
    outpaintWidth?: string;

    @IsOptional()
    @IsNumberString()
    outpaintHeight?: string;

    @IsOptional()
    @IsNumberString()
    outpaintOffsetX?: string;

    @IsOptional()
    @IsNumberString()
    outpaintOffsetY?: string;

    @IsOptional()
    @IsIn(['t2v', 'i2v', 'v2v', 'draft_enhance'])
    fluxVideoMode?: 't2v' | 'i2v' | 'v2v' | 'draft_enhance';

    @IsOptional()
    @IsIn(['generate', 'deblur', 'erase', 'try_on', 'outpaint'])
    fluxImageMode?: 'generate' | 'deblur' | 'erase' | 'try_on' | 'outpaint';

    @IsOptional()
    @IsIn(['auto', 'manga'])
    lumaStyle?: 'auto' | 'manga';

    @IsOptional()
    @IsString()
    lumaWebSearch?: string;

    @IsOptional()
    @IsIn(['png', 'jpeg'])
    lumaOutputFormat?: 'png' | 'jpeg';

    @IsOptional()
    @IsString()
    sourceGenerationId?: string;

    @IsOptional()
    @IsIn(['create', 'extend', 'edit'])
    soraVideoMode?: 'create' | 'extend' | 'edit';

    @IsOptional()
    @IsString()
    soraCharacterIds?: string;

    @IsOptional()
    @IsString()
    attachmentRoles?: string;
}

class CreateSoraCharacterBodyDto {
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    name!: string;
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

class SendPromptBodyDto {
    @IsString()
    @MinLength(1)
    @MaxLength(8000)
    prompt!: string;

    @IsOptional()
    @IsString()
    editorLabel?: string;
}

@Controller('api/ai')
@UseGuards(TelegramJwtGuard)
export class AiController {
    constructor(
        private readonly generationFacade: GenerationFacade,
        private readonly prismaService: PrismaService,
        private readonly userAiToolSettingsModelService: UserAiToolSettingsModelService,
        private readonly elevenLabsProvider: ElevenLabsProvider,
        private readonly higgsfieldProvider: HiggsfieldProvider,
        private readonly heyGenProvider: HeyGenProvider,
        private readonly elevenLabsVoicePreviewService: ElevenLabsVoicePreviewService,
        private readonly soraCharactersService: SoraCharactersService,
        private readonly openAiProvider: OpenAiProvider,
        private readonly bytePlusProvider: BytePlusProvider,
        private readonly tempPublicMedia: TempPublicMediaService,
        private readonly moduleRef: ModuleRef,
    ) {}

    private static readonly MEDIA_CACHE_MAX = 80;
    private static readonly MEDIA_CACHE_MAX_BYTES = 200 * 1024 * 1024;
    private readonly mediaCache = new Map<
        string,
        { buffer: Buffer; mimeType: string; accessedAt: number }
    >();
    private mediaCacheBytes = 0;

    private getCachedMedia(
        jobId: string,
    ): { buffer: Buffer; mimeType: string } | null {
        const entry = this.mediaCache.get(jobId);
        if (!entry) return null;
        entry.accessedAt = Date.now();
        return { buffer: entry.buffer, mimeType: entry.mimeType };
    }

    private setCachedMedia(
        jobId: string,
        buffer: Buffer,
        mimeType: string,
    ): void {
        const existing = this.mediaCache.get(jobId);
        if (existing) {
            this.mediaCacheBytes -= existing.buffer.length;
        }
        this.mediaCacheBytes += buffer.length;
        this.mediaCache.set(jobId, {
            buffer,
            mimeType,
            accessedAt: Date.now(),
        });
        this.evictMediaCache();
    }

    private evictMediaCache(): void {
        while (
            (this.mediaCache.size > AiController.MEDIA_CACHE_MAX ||
                this.mediaCacheBytes > AiController.MEDIA_CACHE_MAX_BYTES) &&
            this.mediaCache.size > 0
        ) {
            let oldest: string | null = null;
            let oldestTime = Infinity;
            for (const [key, val] of this.mediaCache) {
                if (val.accessedAt < oldestTime) {
                    oldestTime = val.accessedAt;
                    oldest = key;
                }
            }
            if (!oldest) break;
            const entry = this.mediaCache.get(oldest)!;
            this.mediaCacheBytes -= entry.buffer.length;
            this.mediaCache.delete(oldest);
        }
    }

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

    @Get('sora/characters')
    async listSoraCharacters(@CurrentUser() current: CurrentUserPayload) {
        const items = await this.soraCharactersService.listCharacters(current.id);
        return { items };
    }

    @Post('sora/characters')
    @UseInterceptors(
        FilesInterceptor('video', 1, {
            storage: memoryStorage(),
            limits: { fileSize: MAX_UPLOAD_BYTES },
        }),
    )
    async createSoraCharacter(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: CreateSoraCharacterBodyDto,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        const file = files?.[0];
        if (!file?.buffer?.length) {
            throw new HttpException(
                { error: 'Загрузите короткое видео персонажа (2–4 сек)' },
                HttpStatus.BAD_REQUEST,
            );
        }

        try {
            const character = await this.soraCharactersService.createCharacter({
                userId: current.id,
                name: body.name,
                videoBuffer: file.buffer,
                mimeType: normalizeUploadMime({
                    buffer: file.buffer,
                    mimeType: file.mimetype,
                    fileName: file.originalname,
                }).mimeType,
                fileName: file.originalname,
            });
            return { character };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Character create failed';
            throw new HttpException(
                { error: toUserFacingError(message) },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    @Delete('sora/characters/:characterId')
    async deleteSoraCharacter(
        @CurrentUser() current: CurrentUserPayload,
        @Param('characterId') characterId: string,
    ) {
        await this.soraCharactersService.deleteCharacter(
            current.id,
            characterId,
        );
        return { ok: true };
    }

    @Get('voices')
    async listVoices() {
        const voices = await this.elevenLabsProvider.listAccessibleVoices();
        return voices.map((voice) => ({
            id: voice.id,
            labelRu: voice.labelRu,
            labelEn: voice.labelEn,
            gender: voice.gender ?? null,
            useCase: voice.useCase ?? null,
            useCaseRu:
                getElevenLabsUseCaseLabel(voice.useCase, 'ru-RU') ?? null,
            age: voice.age ?? null,
            ageRu:
                getElevenLabsAgeLabel(
                    voice.age,
                    'ru-RU',
                    voice.gender,
                ) ?? null,
            previewUrl: voice.previewUrl ?? null,
        }));
    }

    @Get('higgsfield/motions')
    async listHiggsfieldMotions() {
        return this.higgsfieldProvider.listMotions();
    }

    @Get('heygen/voices')
    async listHeyGenVoices(
        @Query('language') language?: string,
        @Query('gender') gender?: string,
    ) {
        return this.heyGenProvider.listPublicVoices({ language, gender });
    }

    @Get('heygen/avatars')
    async listHeyGenAvatars() {
        return this.heyGenProvider.listPublicLooks();
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
                { error: 'Нужно указать голос' },
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
            throw new HttpException(
                { error: toUserFacingError(message) },
                HttpStatus.BAD_GATEWAY,
            );
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
                      compressReferenceImage(
                          normalizeUploadMime({
                              buffer: file.buffer,
                              mimeType: file.mimetype,
                              fileName: file.originalname,
                          }),
                      ),
                  ),
              )
            : undefined;

        try {
            return await this.generationFacade.generate({
                userId: current.id,
                telegramId: current.telegramId,
                toolId: body.toolId,
                conversationId: body.conversationId,
                sessionId: body.sessionId,
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
                    higgsfieldMotionId: body.higgsfieldMotionId,
                    elevenLabsVoiceId: body.elevenLabsVoiceId,
                    heygenVoiceId: body.heygenVoiceId,
                    heygenAvatarId: body.heygenAvatarId,
                    heygenEngine: body.heygenEngine,
                    heygenCaptions:
                        body.heygenCaptions === 'true' ||
                        body.heygenCaptions === '1',
                    heygenBackgroundMode: body.heygenBackgroundMode,
                    heygenBackgroundColor: body.heygenBackgroundColor,
                    heygenExpressiveness: body.heygenExpressiveness,
                    heygenMotionPrompt: body.heygenMotionPrompt,
                    heygenVoiceSpeed: body.heygenVoiceSpeed
                        ? Number(body.heygenVoiceSpeed)
                        : undefined,
                    heygenVoicePitch: body.heygenVoicePitch
                        ? Number(body.heygenVoicePitch)
                        : undefined,
                    gptWebSearch:
                        body.gptWebSearch === 'true' ||
                        body.gptWebSearch === '1',
                    gptReplyMode: body.gptReplyMode,
                    sunoGenreId: body.sunoGenreId,
                    sunoMoodId: body.sunoMoodId,
                    sunoInstrumental:
                        body.sunoInstrumental === 'true' ||
                        body.sunoInstrumental === '1',
                    sunoLyrics: body.sunoLyrics,
                    outpaintWidth: body.outpaintWidth
                        ? Number(body.outpaintWidth)
                        : undefined,
                    outpaintHeight: body.outpaintHeight
                        ? Number(body.outpaintHeight)
                        : undefined,
                    outpaintOffsetX: body.outpaintOffsetX
                        ? Number(body.outpaintOffsetX)
                        : undefined,
                    outpaintOffsetY: body.outpaintOffsetY
                        ? Number(body.outpaintOffsetY)
                        : undefined,
                    fluxVideoMode: body.fluxVideoMode,
                    fluxImageMode: body.fluxImageMode,
                    lumaStyle: body.lumaStyle,
                    lumaWebSearch:
                        body.lumaWebSearch === 'true' ||
                        body.lumaWebSearch === '1',
                    lumaOutputFormat: body.lumaOutputFormat,
                    sourceGenerationId: body.sourceGenerationId,
                    soraVideoMode: body.soraVideoMode,
                    soraCharacterIds: (() => {
                        if (!body.soraCharacterIds) return undefined;
                        try {
                            const parsed = JSON.parse(body.soraCharacterIds);
                            if (Array.isArray(parsed)) {
                                return parsed.filter(
                                    (value): value is string =>
                                        typeof value === 'string',
                                );
                            }
                        } catch {
                            // fall through to comma-separated parsing
                        }
                        return body.soraCharacterIds
                            .split(',')
                            .map((id) => id.trim())
                            .filter(Boolean);
                    })(),
                    attachmentRoles: (() => {
                        if (!body.attachmentRoles) return undefined;
                        try {
                            return JSON.parse(
                                body.attachmentRoles,
                            ) as AiGenerationInput['attachmentRoles'];
                        } catch {
                            return body.attachmentRoles
                                .split(',')
                                .map((role) =>
                                    role.trim(),
                                ) as AiGenerationInput['attachmentRoles'];
                        }
                    })(),
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

            throw new HttpException(
                { error: toUserFacingError(message) },
                HttpStatus.BAD_REQUEST,
            );
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
                providerJobId: true,
                errorMessage: true,
                tokenCost: true,
                inputJson: true,
                sessionId: true,
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
                    providerJobId: job.providerJobId,
                    errorMessage: job.errorMessage
                        ? toUserFacingError(job.errorMessage, getI18n())
                        : job.errorMessage,
                    tokenCost: job.tokenCost,
                    prompt: input?.prompt ?? '',
                    sessionId: job.sessionId ?? undefined,
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

    @Delete('jobs/:jobId')
    async deleteJob(
        @CurrentUser() current: CurrentUserPayload,
        @Param('jobId') jobId: string,
    ) {
        const existing = await this.prismaService.aiGenerationJob.findFirst({
            where: { id: jobId, userId: current.id },
            select: { id: true },
        });

        if (!existing) {
            throw new HttpException(
                { error: 'Генерация не найдена' },
                HttpStatus.NOT_FOUND,
            );
        }

        await this.prismaService.aiGenerationJob.delete({
            where: { id: jobId },
        });

        return { ok: true };
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
                { error: 'Нужно указать промпт' },
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

    @Post('send-prompt')
    async sendPromptToTelegram(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: SendPromptBodyDto,
    ) {
        const trimmed = body.prompt.trim();
        if (!trimmed) {
            throw new HttpException(
                { error: 'Нужно указать промпт' },
                HttpStatus.BAD_REQUEST,
            );
        }

        try {
            const botService = this.moduleRef.get(BotService, {
                strict: false,
            });
            const editor = body.editorLabel?.trim()
                ? `Редактор: ${body.editorLabel.trim()}\n\n`
                : '';
            await botService.sendMessage(
                current.telegramId,
                `📝 Промпт из мини-приложения:\n\n${editor}${trimmed}`,
            );
            return { ok: true };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Send failed';
            throw new HttpException(
                { error: toUserFacingError(message) },
                HttpStatus.BAD_GATEWAY,
            );
        }
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
                { error: 'Промпт не найден' },
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
                providerJobId: true,
                errorMessage: true,
                tokenCost: true,
                inputJson: true,
                sessionId: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!job) {
            throw new HttpException(
                { error: 'Генерация не найдена' },
                HttpStatus.NOT_FOUND,
            );
        }

        const input = job.inputJson as { prompt?: string } | null;

        return {
            id: job.id,
            toolId: job.toolId,
            status: job.status,
            hasResult: Boolean(job.resultUrl),
            providerJobId: job.providerJobId,
            errorMessage: job.errorMessage
                ? toUserFacingError(job.errorMessage, getI18n())
                : job.errorMessage,
            tokenCost: job.tokenCost,
            prompt: input?.prompt ?? '',
            sessionId: job.sessionId ?? undefined,
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
                { error: 'Файл не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        const { buffer, mimeType } = await this.resolveJobMedia(
            job.resultUrl,
            job.providerJobId,
            job.toolId as AiToolId,
        );
        const type = this.resolveMediaType(job.toolId as AiToolId, mimeType);
        const caption = getToolLabel(job.toolId as AiToolId);

        try {
            const botService = this.moduleRef.get(BotService, {
                strict: false,
            });
            if (type === 'video') {
                await botService.sendVideoBuffer(
                    current.telegramId,
                    buffer,
                    mimeType,
                    false,
                    caption,
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
                        caption,
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
                        caption,
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
            throw new HttpException(
                { error: toUserFacingError(message) },
                HttpStatus.BAD_GATEWAY,
            );
        }
    }

    @Get('jobs/:jobId/media')
    async getJobMedia(
        @CurrentUser() current: CurrentUserPayload,
        @Param('jobId') jobId: string,
        @Query('download') download: string | undefined,
        @Req() req: Request,
        @Res() res: Response,
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
                { error: 'Файл не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        const disposition = download === '1' ? 'attachment' : 'inline';
        const filenameBase = `generation-${jobId.slice(0, 8)}`;

        try {
            let media = this.getCachedMedia(jobId);

            if (!media) {
                const jobLocal = this.tempPublicMedia.getByJobId(jobId);
                if (jobLocal) {
                    media = {
                        buffer: jobLocal.buffer,
                        mimeType: jobLocal.mimeType,
                    };
                }
            }

            if (!media) {
                const buffered = await this.resolveBufferedJobMedia(
                    job.resultUrl,
                    job.providerJobId,
                    job.toolId as AiToolId,
                );

                if (buffered) {
                    media = buffered;
                } else {
                    try {
                        media = await downloadRemoteFile(
                            job.resultUrl,
                            getAuthHeadersForUrl(job.resultUrl),
                        );
                    } catch (remoteError) {
                        if (
                            job.toolId === AiToolId.SEEDANCE &&
                            job.providerJobId
                        ) {
                            const status =
                                await this.bytePlusProvider.getJobStatus(
                                    job.providerJobId,
                                );
                            if (status.result?.buffer) {
                                media = {
                                    buffer: status.result.buffer,
                                    mimeType:
                                        status.result.mimeType ?? 'video/mp4',
                                };
                            } else {
                                throw remoteError;
                            }
                        } else if (
                            job.toolId === AiToolId.HIGGSFIELD &&
                            job.providerJobId
                        ) {
                            const fetched =
                                await this.higgsfieldProvider.fetchResultMedia(
                                    job.providerJobId,
                                );
                            if (fetched) {
                                media = fetched;
                            } else {
                                throw remoteError;
                            }
                        } else {
                            throw remoteError;
                        }
                    }
                }

                this.setCachedMedia(jobId, media.buffer, media.mimeType);
                this.tempPublicMedia.put({
                    buffer: media.buffer,
                    mimeType: media.mimeType,
                    fileName: filenameBase,
                    jobId,
                });
            }

            const ext = media.mimeType.startsWith('video/')
                ? 'mp4'
                : media.mimeType.startsWith('audio/')
                  ? 'mp3'
                  : media.mimeType.includes('png')
                    ? 'png'
                    : 'jpg';
            const filename = `${filenameBase}.${ext}`;
            this.sendBufferedMedia(req, res, media.buffer, {
                mimeType: media.mimeType,
                disposition,
                filename,
            });
        } catch (error) {
            if (res.headersSent) {
                return;
            }
            const message =
                error instanceof Error
                    ? error.message
                    : 'Media download failed';
            throw new HttpException(
                { error: toUserFacingError(message) },
                HttpStatus.BAD_GATEWAY,
            );
        }
    }

    /** Returns buffer for data URLs and ElevenLabs dubbing; null for streamable remote URLs. */
    private async resolveBufferedJobMedia(
        resultUrl: string,
        providerJobId: string | null,
        toolId?: AiToolId,
    ): Promise<{ buffer: Buffer; mimeType: string } | null> {
        const dataUrl = parseDataUrl(resultUrl);
        if (dataUrl) {
            return { buffer: dataUrl.buffer, mimeType: dataUrl.mimeType };
        }

        if (isOpenAiVideoResultUrl(resultUrl) && providerJobId) {
            const status = await this.openAiProvider.getJobStatus(providerJobId);
            if (!status.result?.buffer || !status.result.mimeType) {
                throw new Error('OpenAI video result is empty');
            }
            return {
                buffer: status.result.buffer,
                mimeType: status.result.mimeType,
            };
        }

        if (
            toolId === AiToolId.SEEDANCE &&
            providerJobId &&
            /bytepluses?\.com|byteplus|tos-cn|tos-ap|ark\./i.test(resultUrl)
        ) {
            const status =
                await this.bytePlusProvider.getJobStatus(providerJobId);
            if (status.result?.buffer) {
                return {
                    buffer: status.result.buffer,
                    mimeType: status.result.mimeType ?? 'video/mp4',
                };
            }
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

        if (toolId === AiToolId.HIGGSFIELD && providerJobId) {
            return this.higgsfieldProvider.fetchResultMedia(providerJobId);
        }

        return null;
    }

    private sendBufferedMedia(
        req: Request,
        res: Response,
        buffer: Buffer,
        options: {
            mimeType: string;
            disposition: 'inline' | 'attachment';
            filename: string;
        },
    ) {
        const size = buffer.length;
        res.setHeader('Content-Type', options.mimeType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader(
            'Content-Disposition',
            `${options.disposition}; filename="${options.filename}"`,
        );

        const rangeHeader =
            typeof req.headers.range === 'string'
                ? req.headers.range
                : undefined;
        if (rangeHeader) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
            if (match) {
                const start = match[1] ? Number(match[1]) : 0;
                const end = match[2] ? Number(match[2]) : size - 1;
                if (
                    Number.isFinite(start) &&
                    Number.isFinite(end) &&
                    start >= 0 &&
                    end >= start &&
                    start < size
                ) {
                    const safeEnd = Math.min(end, size - 1);
                    const chunk = buffer.subarray(start, safeEnd + 1);
                    res.status(206);
                    res.setHeader(
                        'Content-Range',
                        `bytes ${start}-${safeEnd}/${size}`,
                    );
                    res.setHeader('Content-Length', String(chunk.length));
                    res.end(chunk);
                    return;
                }
            }
        }

        res.setHeader('Content-Length', String(size));
        res.end(buffer);
    }

    private async resolveJobMedia(
        resultUrl: string,
        providerJobId: string | null,
        toolId: AiToolId,
    ): Promise<{ buffer: Buffer; mimeType: string }> {
        const buffered = await this.resolveBufferedJobMedia(
            resultUrl,
            providerJobId,
            toolId,
        );
        if (buffered) {
            return buffered;
        }

        try {
            return await downloadRemoteFile(
                resultUrl,
                getAuthHeadersForUrl(resultUrl),
            );
        } catch (remoteError) {
            if (toolId === AiToolId.SEEDANCE && providerJobId) {
                const status =
                    await this.bytePlusProvider.getJobStatus(providerJobId);
                if (status.result?.buffer) {
                    return {
                        buffer: status.result.buffer,
                        mimeType: status.result.mimeType ?? 'video/mp4',
                    };
                }
            }
            throw remoteError;
        }
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
                { error: 'Неизвестный инструмент' },
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
