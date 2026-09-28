import type { AiGenerationInput } from '../types';
import type { Prisma } from '@/generated/prisma/client';
import { stripAttachmentMentionManifest } from '@/common/services/bot/utils/image-references';

/**
 * JSON-safe job input for DB. File buffers as `{type:'Buffer',data:number[]}`
 * explode row size and make history list unbearably slow — store base64 while
 * the job can still failover, and drop binaries once the job is terminal.
 */
export function jobPromptForDb(input: AiGenerationInput): string | null {
    const prompt = stripAttachmentMentionManifest(input.prompt ?? '');
    if (!prompt) return null;
    return prompt.slice(0, 4000);
}

/** Lightweight file presence signal — safe to keep after binaries are stripped. */
export function inputFileCountFromJson(inputJson: unknown): number {
    if (
        !inputJson ||
        typeof inputJson !== 'object' ||
        Array.isArray(inputJson)
    ) {
        return 0;
    }
    const obj = inputJson as Record<string, unknown>;
    if (typeof obj.fileCount === 'number' && Number.isFinite(obj.fileCount)) {
        return Math.max(0, Math.floor(obj.fileCount));
    }
    if (Array.isArray(obj.files)) {
        return obj.files.length;
    }
    return 0;
}

export function toPersistedInputJson(
    input: AiGenerationInput,
    options?: { includeFiles?: boolean },
): Prisma.InputJsonValue {
    const includeFiles = options?.includeFiles === true;
    const { files, chatHistory, ...rest } = input;
    const persisted: Record<string, unknown> = { ...rest };

    // Always keep fileCount so history/retry can warn after binaries are stripped.
    if (files?.length) {
        persisted.fileCount = files.length;
        persisted.fileMimeTypes = files.map((file) => file.mimeType);
        if (includeFiles) {
            persisted.files = files.map((file) => ({
                mimeType: file.mimeType,
                fileName: file.fileName,
                buffer: file.buffer.toString('base64'),
            }));
        }
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
