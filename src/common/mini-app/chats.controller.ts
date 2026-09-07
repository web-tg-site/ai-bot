import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    HttpStatus,
    Param,
    Post,
    Query,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser, TelegramJwtGuard } from '@/common/auth';
import type { CurrentUserPayload } from '@/common/auth';
import { GptConversationModelService } from '@/common/models/gpt-conversation';
import { AiToolId } from '@/common/services/ai/types';
import { isChatAssistantTool } from '@/common/utils/is-chat-assistant-tool';
import {
    parseGptMediaMessage,
    splitGptAttachmentNotes,
    toDataUrl,
} from '@/common/utils/gpt-message-content';
import { isImageMedia } from '@/common/utils/media-kind';
import { prepareUploadMediaList } from '@/common/utils/prepare-upload-media';
import { PrismaService } from '@/common/services/prisma';
import { GenerationFacade } from './generation.facade';

const uploadInterceptor = FilesInterceptor('files', 50, {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});

class CreateChatDto {
    @IsEnum(AiToolId)
    toolId!: AiToolId;

    @IsOptional()
    @IsString()
    title?: string;
}

class SendMessageDto {
    @IsString()
    prompt!: string;

    @IsOptional()
    @IsString()
    gptWebSearch?: string;

    @IsOptional()
    @IsIn(['text', 'audio', 'both'])
    gptReplyMode?: 'text' | 'audio' | 'both';
}

@Controller('api/chats')
@UseGuards(TelegramJwtGuard)
export class ChatsController {
    constructor(
        private readonly gptConversationModelService: GptConversationModelService,
        private readonly generationFacade: GenerationFacade,
        private readonly prismaService: PrismaService,
    ) {}

    @Get()
    async list(
        @CurrentUser() current: CurrentUserPayload,
        @Query('toolId') toolId: string,
    ) {
        this.assertChatTool(toolId);
        return this.gptConversationModelService.listConversations(
            current.id,
            toolId as AiToolId,
        );
    }

    @Delete()
    async clearAll(
        @CurrentUser() current: CurrentUserPayload,
        @Query('toolId') toolId: string,
    ) {
        this.assertChatTool(toolId);
        const result = await this.prismaService.gptConversation.deleteMany({
            where: {
                userId: current.id,
                toolId: toolId as AiToolId,
            },
        });
        return { deleted: result.count };
    }

    @Post()
    async create(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: CreateChatDto,
    ) {
        this.assertChatTool(body.toolId);
        const conversation =
            await this.gptConversationModelService.createConversation(
                current.id,
                body.toolId,
                body.title,
            );
        return conversation;
    }

    @Get(':id')
    async getOne(
        @CurrentUser() current: CurrentUserPayload,
        @Param('id') id: string,
    ) {
        const conversation =
            await this.gptConversationModelService.getConversation(
                current.id,
                id,
            );
        if (!conversation) {
            throw new HttpException(
                { error: 'Чат не найден' },
                HttpStatus.NOT_FOUND,
            );
        }
        return conversation;
    }

    @Get(':id/messages')
    async getMessages(
        @CurrentUser() current: CurrentUserPayload,
        @Param('id') id: string,
    ) {
        const conversation =
            await this.gptConversationModelService.getConversation(
                current.id,
                id,
            );
        if (!conversation) {
            throw new HttpException(
                { error: 'Чат не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        const rows = await this.prismaService.gptMessage.findMany({
            where: { conversationId: id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });

        // Same createdAt (legacy createMany) can still put assistant before
        // user — keep the request + file chip above the reply.
        const ordered = [...rows].sort((left, right) => {
            const byTime =
                left.createdAt.getTime() - right.createdAt.getTime();
            if (byTime !== 0) return byTime;
            if (left.role === right.role) return left.id.localeCompare(right.id);
            return left.role === 'user' ? -1 : 1;
        });

        return {
            items: ordered.map((msg) => {
                const parsed = parseGptMediaMessage(msg.content);
                const images = parsed.files
                    ?.filter((file) =>
                        isImageMedia(file.mimeType, file.fileName),
                    )
                    .map((file) => toDataUrl(file));

                if (msg.role !== 'user') {
                    return {
                        id: msg.id,
                        role: msg.role,
                        content: parsed.text,
                        images: images?.length ? images : undefined,
                        jobId: parsed.jobId,
                        createdAt: msg.createdAt,
                    };
                }

                // Documents / video / audio are stored as text notes, so the
                // prompt has to be separated from them to render both.
                const { text, notes } = splitGptAttachmentNotes(parsed.text);
                const attachments = [
                    ...(images ?? []).map((src) => ({
                        kind: 'image' as const,
                        src,
                    })),
                    ...notes.map((note) => ({
                        kind: note.kind,
                        name: note.name,
                    })),
                ];

                return {
                    id: msg.id,
                    role: msg.role,
                    content: text,
                    images: images?.length ? images : undefined,
                    attachments: attachments.length ? attachments : undefined,
                    jobId: parsed.jobId,
                    createdAt: msg.createdAt,
                };
            }),
        };
    }

    @Post(':id/messages')
    @UseInterceptors(uploadInterceptor)
    async sendMessage(
        @CurrentUser() current: CurrentUserPayload,
        @Param('id') id: string,
        @Body() body: SendMessageDto,
        @UploadedFiles() files?: Express.Multer.File[],
    ) {
        const conversation =
            await this.gptConversationModelService.getConversation(
                current.id,
                id,
            );
        if (!conversation) {
            throw new HttpException(
                { error: 'Чат не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        this.assertChatTool(conversation.toolId);

        const preparedFiles = await prepareUploadMediaList(
            files?.map((file) => ({
                buffer: file.buffer,
                mimeType: file.mimetype,
                fileName: file.originalname,
            })),
        );

        return this.generationFacade.generate({
            userId: current.id,
            telegramId: current.telegramId,
            toolId: conversation.toolId as AiToolId,
            conversationId: conversation.id,
            promptText: body.prompt,
            input: {
                prompt: body.prompt,
                files: preparedFiles,
                gptWebSearch: true,
                gptReplyMode: body.gptReplyMode,
            },
        });
    }

    @Post(':id/clear')
    async clear(
        @CurrentUser() current: CurrentUserPayload,
        @Param('id') id: string,
    ) {
        const conversation =
            await this.gptConversationModelService.getConversation(
                current.id,
                id,
            );
        if (!conversation) {
            throw new HttpException(
                { error: 'Чат не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        await this.gptConversationModelService.clearConversation(id);
        return { ok: true };
    }

    @Delete(':id')
    async remove(
        @CurrentUser() current: CurrentUserPayload,
        @Param('id') id: string,
    ) {
        const deleted =
            await this.gptConversationModelService.deleteConversation(
                current.id,
                id,
            );
        if (!deleted) {
            throw new HttpException(
                { error: 'Чат не найден' },
                HttpStatus.NOT_FOUND,
            );
        }
        return { ok: true };
    }

    private assertChatTool(toolId: string) {
        if (!isChatAssistantTool(toolId as AiToolId)) {
            throw new HttpException(
                { error: 'Неверный инструмент чата' },
                HttpStatus.BAD_REQUEST,
            );
        }
    }
}
