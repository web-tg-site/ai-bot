import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/services/prisma';
import { AiChatMessage, AiToolId } from '@/common/services/ai/types';
import { parseGptUserMessage } from '@/common/utils/gpt-message-content';

const DEFAULT_TITLE = 'Новый чат';
const MAX_CONTEXT_MESSAGES = 20;
const MAX_CONVERSATIONS = 50;

@Injectable()
export class GptConversationModelService {
    constructor(private readonly prismaService: PrismaService) {}

    async createConversation(
        userId: string,
        toolId: AiToolId,
        title = DEFAULT_TITLE,
    ) {
        return this.prismaService.gptConversation.create({
            data: { userId, toolId, title },
        });
    }

    async getOrCreateActiveConversation(
        userId: string,
        toolId: AiToolId,
        conversationId?: string,
    ) {
        if (conversationId) {
            const existing = await this.prismaService.gptConversation.findFirst(
                {
                    where: { id: conversationId, userId, toolId },
                },
            );
            if (existing) {
                return existing;
            }
        }

        const latest = await this.prismaService.gptConversation.findFirst({
            where: { userId, toolId },
            orderBy: { updatedAt: 'desc' },
        });

        if (latest) {
            return latest;
        }

        return this.createConversation(userId, toolId);
    }

    async listConversations(
        userId: string,
        toolId: AiToolId,
        limit = 8,
        offset = 0,
    ) {
        const where = { userId, toolId };
        const [items, total] = await Promise.all([
            this.prismaService.gptConversation.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prismaService.gptConversation.count({ where }),
        ]);

        return { items, total };
    }

    async getConversation(
        userId: string,
        conversationId: string,
        toolId?: AiToolId,
    ) {
        return this.prismaService.gptConversation.findFirst({
            where: {
                id: conversationId,
                userId,
                ...(toolId ? { toolId } : {}),
            },
        });
    }

    async getMessages(conversationId: string): Promise<AiChatMessage[]> {
        const messages = await this.prismaService.gptMessage.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: MAX_CONTEXT_MESSAGES,
        });

        return messages.map((msg) => {
            if (msg.role === 'user') {
                const parsed = parseGptUserMessage(msg.content);
                return {
                    role: 'user' as const,
                    content: parsed.text,
                    files: parsed.files,
                };
            }

            return {
                role: msg.role as AiChatMessage['role'],
                content: msg.content,
            };
        });
    }

    async getLastMessage(conversationId: string) {
        return this.prismaService.gptMessage.findFirst({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async appendMessages(
        conversationId: string,
        userContent: string,
        assistantContent: string,
    ) {
        await this.prismaService.$transaction([
            this.prismaService.gptMessage.createMany({
                data: [
                    {
                        conversationId,
                        role: 'user',
                        content: userContent,
                    },
                    {
                        conversationId,
                        role: 'assistant',
                        content: assistantContent,
                    },
                ],
            }),
            this.prismaService.gptConversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
            }),
        ]);
    }

    async setTitleIfDefault(
        conversationId: string,
        title: string,
        defaultTitle = DEFAULT_TITLE,
    ) {
        const conversation =
            await this.prismaService.gptConversation.findUnique({
                where: { id: conversationId },
            });

        if (!conversation || conversation.title !== defaultTitle) {
            return;
        }

        await this.prismaService.gptConversation.update({
            where: { id: conversationId },
            data: { title },
        });
    }

    async clearConversation(conversationId: string) {
        await this.prismaService.gptMessage.deleteMany({
            where: { conversationId },
        });
    }

    async deleteConversation(userId: string, conversationId: string) {
        const conversation = await this.getConversation(userId, conversationId);
        if (!conversation) {
            return false;
        }

        await this.prismaService.gptConversation.delete({
            where: { id: conversationId },
        });

        return true;
    }

    async trimOldConversations(userId: string, toolId: AiToolId) {
        const conversations = await this.prismaService.gptConversation.findMany(
            {
                where: { userId, toolId },
                orderBy: { updatedAt: 'desc' },
                skip: MAX_CONVERSATIONS,
                select: { id: true },
            },
        );

        if (!conversations.length) {
            return;
        }

        await this.prismaService.gptConversation.deleteMany({
            where: { id: { in: conversations.map((c) => c.id) } },
        });
    }

    buildTitleFromPrompt(prompt: string): string {
        const trimmed = prompt.trim();
        if (!trimmed) {
            return DEFAULT_TITLE;
        }

        return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
    }
}
