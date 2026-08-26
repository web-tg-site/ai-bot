import type { AiGenerationInput } from '../types';
import type { Prisma } from '@/generated/prisma/client';

/**
 * JSON-safe job input for DB. File buffers as `{type:'Buffer',data:number[]}`
 * explode row size and make history list unbearably slow — store base64 while
 * the job can still failover, and drop binaries once the job is terminal.
 */
export function toPersistedInputJson(
    input: AiGenerationInput,
    options?: { includeFiles?: boolean },
): Prisma.InputJsonValue {
    const includeFiles = options?.includeFiles === true;
    const { files, chatHistory, ...rest } = input;
    const persisted: Record<string, unknown> = { ...rest };

    if (includeFiles && files?.length) {
        persisted.files = files.map((file) => ({
            mimeType: file.mimeType,
            fileName: file.fileName,
            buffer: file.buffer.toString('base64'),
        }));
    } else if (files?.length) {
        persisted.fileCount = files.length;
        persisted.fileMimeTypes = files.map((file) => file.mimeType);
    }

    if (chatHistory?.length) {
        persisted.chatHistory = chatHistory.map((message) => {
            if (!includeFiles || !message.files?.length) {
                return { role: message.role, content: message.content };
            }
            return {
                role: message.role,
                content: message.content,
                files: message.files.map((file) => ({
                    mimeType: file.mimeType,
                    fileName: file.fileName,
                    buffer: file.buffer.toString('base64'),
                })),
            };
        });
    }

    return persisted as Prisma.InputJsonValue;
}
