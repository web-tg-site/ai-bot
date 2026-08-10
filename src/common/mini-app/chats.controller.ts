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
import { parseGptUserMessage } from '@/common/utils/gpt-message-content';
import { PrismaService } from '@/common/services/prisma';
import { GenerationFacade } from './generation.facade';

const uploadInterceptor = FilesInterceptor('files', 10, {
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
                { error: 'Chat not found' },
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
                { error: 'Chat not found' },
                HttpStatus.NOT_FOUND,
            );
        }

        const rows = await this.prismaService.gptMessage.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' },
        });

        return {
            items: rows.map((msg) => {
                if (msg.role === 'user') {
                    const parsed = parseGptUserMessage(msg.content);
                    return {
                        id: msg.id,
                        role: 'user' as const,
                        content: parsed.text,
                        createdAt: msg.createdAt,
                    };
                }

                return {
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
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
                { error: 'Chat not found' },
                HttpStatus.NOT_FOUND,
            );
        }

        this.assertChatTool(conversation.toolId);

        return this.generationFacade.generate({
            userId: current.id,
            telegramId: current.telegramId,
            toolId: conversation.toolId as AiToolId,
            conversationId: conversation.id,
            promptText: body.prompt,
            input: {
                prompt: body.prompt,
                files: files?.map((file) => ({
                    buffer: file.buffer,
                    mimeType: file.mimetype,
                    fileName: file.originalname,
                })),
                gptWebSearch:
                    body.gptWebSearch === 'true' || body.gptWebSearch === '1',
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
                { error: 'Chat not found' },
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
                { error: 'Chat not found' },
                HttpStatus.NOT_FOUND,
            );
        }
        return { ok: true };
    }

    private assertChatTool(toolId: string) {
        if (!isChatAssistantTool(toolId as AiToolId)) {
            throw new HttpException(
                { error: 'Invalid chat tool' },
                HttpStatus.BAD_REQUEST,
            );
        }
    }
}
