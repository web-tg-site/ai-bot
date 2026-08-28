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
    getElevenLabsAgeLabel,
    getElevenLabsUseCaseLabel,
} from '@/common/config/elevenlabs-voices.config';
import { HiggsfieldProvider } from '@/common/services/ai/providers/higgsfield.provider';
import { HeyGenProvider } from '@/common/services/ai/providers/heygen.provider';
import { ElevenLabsProvider } from '@/common/services/ai/providers/elevenlabs.provider';
import { JobMediaResolverService } from '@/common/services/ai/job-media-resolver.service';
import { ElevenLabsVoicePreviewService } from '@/common/services/elevenlabs-voice-preview';
import { GenerationFacade } from './generation.facade';
import { ModuleRef } from '@nestjs/core';
import { BotService } from '@/common/services/bot';
import { SoraCharactersService } from '@/common/services/ai/sora-characters.service';
import { AiJobService } from '@/common/services/ai/jobs/ai-job.service';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';
import { normalizeUploadMime } from '@/common/utils/normalize-upload-mime';
import { getI18n } from '@/common/services/bot/i18n';
import { toUserFacingError } from '@/common/services/bot/errors/bot-error.mapper';
import {
    formatMiniAppPromptMessage,
    formatMiniAppSendMessage,
    formatSendPromptMessage,
    resolveMiniAppJobPrompt,
} from './format-mini-app-send-message';
import { ConfigService } from '@nestjs/config';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const uploadInterceptor = FilesInterceptor('files', 50, {
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
    @IsIn([
        'upsample',
        'variation',
        'inpaint',
        'outpaint',
        'pan',
        'extend',
        'cover',
        'add_vocals',
        'stems',
    ])
    apiframeAction?:
        | 'upsample'
        | 'variation'
        | 'inpaint'
        | 'outpaint'
        | 'pan'
        | 'extend'
        | 'cover'
        | 'add_vocals'
        | 'stems';

    @IsOptional()
    @IsNumberString()
    actionIndex?: string;

    @IsOptional()
    @IsIn(['up', 'down', 'left', 'right'])
    actionDirection?: 'up' | 'down' | 'left' | 'right';

    @IsOptional()
    @IsNumberString()
    continueAt?: string;

    @IsOptional()
    @IsString()
    trackId?: string;

    @IsOptional()
    @IsString()
    sunoTitle?: string;

    @IsOptional()
    @IsString()
    sunoModelVersion?: string;

    @IsOptional()
    @IsString()
    sunoNegativeTags?: string;

    @IsOptional()
    @IsIn(['m', 'f'])
    sunoVocalGender?: 'm' | 'f';

    @IsOptional()
    @IsString()
    sunoAutoLyrics?: string;

    @IsOptional()
    @IsString()
    sunoStyle?: string;

    @IsOptional()
    @IsIn(['create', 'extend', 'edit'])
    soraVideoMode?: 'create' | 'extend' | 'edit';

    @IsOptional()
    @IsString()
    soraCharacterIds?: string;

    @IsOptional()
    @IsString()
    attachmentRoles?: string;

    @IsOptional()
    @IsString()
    negativePrompt?: string;

    @IsOptional()
    @IsString()
    klingSound?: string;

    @IsOptional()
    @IsIn(['image', 'video'])
    klingCharacterOrientation?: 'image' | 'video';

    @IsOptional()
    @IsString()
    klingKeepOriginalSound?: string;
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
        private readonly jobMediaResolver: JobMediaResolverService,
        private readonly aiJobService: AiJobService,
        private readonly moduleRef: ModuleRef,
        private readonly configService: ConfigService,
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

        let parentProviderJobId: string | undefined;
        if (body.apiframeAction && body.sourceGenerationId) {
            const parent = await this.prismaService.aiGenerationJob.findFirst({
                where: {
                    id: body.sourceGenerationId,
                    userId: current.id,
                    status: JobStatus.COMPLETED,
                },
                select: {
                    providerJobId: true,
                    toolId: true,
                    resultJson: true,
                },
            });
            if (!parent?.providerJobId) {
                throw new HttpException(
                    { error: 'Родительская генерация не найдена' },
                    HttpStatus.BAD_REQUEST,
                );
            }
            if (parent.toolId !== body.toolId) {
                throw new HttpException(
                    { error: 'Инструмент не совпадает с родительской генерацией' },
                    HttpStatus.BAD_REQUEST,
                );
            }
            parentProviderJobId = parent.providerJobId;
        }

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
                    sunoTitle: body.sunoTitle,
                    sunoModelVersion: body.sunoModelVersion,
                    sunoNegativeTags: body.sunoNegativeTags,
                    sunoVocalGender: body.sunoVocalGender,
                    sunoAutoLyrics:
                        body.sunoAutoLyrics === 'true' ||
                        body.sunoAutoLyrics === '1',
                    sunoStyle: body.sunoStyle,
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
                    apiframeAction: body.apiframeAction,
                    actionIndex: body.actionIndex
                        ? (Number(body.actionIndex) as 1 | 2 | 3 | 4)
                        : undefined,
                    actionDirection: body.actionDirection,
                    continueAt: body.continueAt
                        ? Number(body.continueAt)
                        : undefined,
                    trackId: body.trackId,
                    parentJobId: body.sourceGenerationId,
                    parentProviderJobId,
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
                    negativePrompt: body.negativePrompt,
                    klingSound:
                        body.klingSound === 'true' || body.klingSound === '1'
                            ? true
                            : body.klingSound === 'false' ||
                                body.klingSound === '0'
                              ? false
                              : undefined,
                    klingCharacterOrientation: body.klingCharacterOrientation,
                    klingKeepOriginalSound:
                        body.klingKeepOriginalSound === 'true' ||
                        body.klingKeepOriginalSound === '1'
                            ? true
                            : body.klingKeepOriginalSound === 'false' ||
                                body.klingKeepOriginalSound === '0'
                              ? false
                              : undefined,
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

        const jobs = await this.aiJobService.listJobsForUser({
            userId: current.id,
            toolId,
            toolIds: !toolId ? categoryToolIds : undefined,
        });

        return {
            items: jobs.map((job) => ({
                id: job.id,
                toolId: job.toolId,
                status: job.status,
                hasResult: Boolean(job.hasResult),
                // Never return data: URLs here — client uses /jobs/:id/media.
                resultUrl: job.resultUrl,
                resultJson: job.resultJson ?? undefined,
                providerJobId: job.providerJobId,
                errorMessage: job.errorMessage
                    ? toUserFacingError(job.errorMessage, getI18n())
                    : job.errorMessage,
                tokenCost: job.tokenCost,
                prompt: job.prompt ?? '',
                sessionId: job.sessionId ?? undefined,
                failoverNotice: job.failoverNotice ?? undefined,
                failoverFromToolId: job.failoverFromToolId ?? undefined,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
            })),
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
            await botService.sendMessage(
                current.telegramId,
                formatSendPromptMessage(trimmed, body.editorLabel),
                { parse_mode: 'HTML' },
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

        if (!job) {
            throw new HttpException(
                { error: 'Генерация не найдена' },
                HttpStatus.NOT_FOUND,
            );
        }

        return {
            id: job.id,
            toolId: job.toolId,
            status: job.status,
            hasResult: job.status === JobStatus.COMPLETED,
            resultUrl: null,
            resultJson: job.resultJson ?? undefined,
            providerJobId: job.providerJobId,
            errorMessage: job.errorMessage
                ? toUserFacingError(job.errorMessage, getI18n())
                : job.errorMessage,
            tokenCost: job.tokenCost,
            prompt: job.prompt ?? '',
            sessionId: job.sessionId ?? undefined,
            failoverNotice: job.failoverNotice ?? undefined,
            failoverFromToolId: job.failoverFromToolId ?? undefined,
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
                prompt: true,
                inputJson: true,
                tokenCost: true,
                user: {
                    select: {
                        tokenLeft: true,
                        language: true,
                    },
                },
            },
        });

        if (!job || job.status !== JobStatus.COMPLETED || !job.resultUrl) {
            throw new HttpException(
                { error: 'Файл не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        const toolId = job.toolId as AiToolId;
        const { buffer, mimeType } =
            await this.jobMediaResolver.resolveCompletedJobMedia({
                id: job.id,
                resultUrl: job.resultUrl,
                providerJobId: job.providerJobId,
                toolId,
            });
        const type = this.jobMediaResolver.resolveMediaType(toolId, mimeType);
        const publicBaseUrl =
            this.configService.get<string>('PUBLIC_BASE_URL') ?? null;

        try {
            const botService = this.moduleRef.get(BotService, {
                strict: false,
            });
            let partialWarning: string | null = null;

            const sendInfoMessage = async () => {
                const messageOptions = {
                    parse_mode: 'HTML' as const,
                    link_preview_options: { is_disabled: false },
                };
                const trimmedPrompt = resolveMiniAppJobPrompt(
                    job.prompt,
                    job.inputJson,
                );
                if (trimmedPrompt) {
                    await botService.sendMessage(
                        current.telegramId,
                        formatMiniAppPromptMessage(trimmedPrompt),
                        messageOptions,
                    );
                }
                await botService.sendMessage(
                    current.telegramId,
                    formatMiniAppSendMessage({
                        jobId: job.id,
                        toolId,
                        inputJson: job.inputJson,
                        tokenCost: job.tokenCost,
                        tokenLeft: job.user.tokenLeft,
                        publicBaseUrl,
                        language: job.user.language,
                        partialWarning,
                    }),
                    messageOptions,
                );
            };

            if (type === 'video') {
                await botService.sendVideoBuffer(
                    current.telegramId,
                    buffer,
                    mimeType,
                    false,
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
                        partialWarning =
                            '⚠️ Фото отправлено, но файл не удалось отправить';
                        await sendInfoMessage();
                        return { ok: true };
                    }
                    const message =
                        fileError instanceof Error
                            ? fileError.message
                            : 'Send failed';
                    throw new Error(message);
                }

                if (!photoSent) {
                    partialWarning =
                        '⚠️ Фото не удалось отправить — слишком большое';
                }
            }

            await sendInfoMessage();
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
                id: true,
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

        try {
            const media = await this.jobMediaResolver.resolveCompletedJobMedia({
                id: job.id,
                resultUrl: job.resultUrl,
                providerJobId: job.providerJobId,
                toolId: job.toolId as AiToolId,
            });
            const filename = this.jobMediaResolver.buildMediaFilename(
                job.id,
                media.mimeType,
            );
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
