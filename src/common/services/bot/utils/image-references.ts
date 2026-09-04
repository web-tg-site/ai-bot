import { randomUUID } from 'crypto';
import { AiFileInput } from '@/common/services/ai/types';
import { StoredReference } from '@/common/services/ai/types/ai-session-state.type';
import {
    isImageMedia,
    isVideoMedia,
} from '@/common/utils/media-kind';
import { prepareUploadMedia } from '@/common/utils/prepare-upload-media';

export type AttachmentMentionKind = 'image' | 'video' | 'file';

export async function serializeReference(
    file: AiFileInput,
): Promise<StoredReference> {
    const prepared = await prepareUploadMedia(file);

    return {
        id: randomUUID(),
        data: prepared.buffer.toString('base64'),
        mimeType: prepared.mimeType,
        fileName: prepared.fileName,
    };
}

export function deserializeReference(reference: StoredReference): AiFileInput {
    return {
        buffer: Buffer.from(reference.data, 'base64'),
        mimeType: reference.mimeType,
        fileName: reference.fileName,
    };
}

export function deserializeReferences(
    references?: StoredReference[],
): AiFileInput[] {
    return references?.map(deserializeReference) ?? [];
}

export function getAttachmentMentionKind(
    file: Pick<AiFileInput, 'mimeType' | 'fileName'>,
): AttachmentMentionKind {
    if (isImageMedia(file.mimeType, file.fileName)) return 'image';
    if (isVideoMedia(file.mimeType, file.fileName)) return 'video';
    return 'file';
}

/** 1-based index among attachments of the same mention kind (file order). */
export function getAttachmentMentionIndex1(
    files: readonly Pick<AiFileInput, 'mimeType' | 'fileName'>[],
    fileIndex: number,
): number {
    const targetKind = getAttachmentMentionKind(files[fileIndex]!);
    let count = 0;
    for (let i = 0; i <= fileIndex; i += 1) {
        if (getAttachmentMentionKind(files[i]!) === targetKind) {
            count += 1;
        }
    }
    return count;
}

export function formatAttachmentMention(
    kind: AttachmentMentionKind,
    index1: number,
): string {
    return `@${kind}${index1}`;
}

export function getReferenceLabel(
    index: number,
    _locale: 'ru-RU' | 'en-US' = 'ru-RU',
    kind: AttachmentMentionKind = 'image',
): string {
    return formatAttachmentMention(kind, index + 1);
}

export function buildAttachmentMentionManifest(
    files: readonly Pick<AiFileInput, 'mimeType' | 'fileName'>[],
    locale: 'ru-RU' | 'en-US',
): string {
    if (!files.length) {
        return '';
    }

    const counters: Record<AttachmentMentionKind, number> = {
        image: 0,
        video: 0,
        file: 0,
    };

    const lines: string[] = [];
    for (const file of files) {
        const kind = getAttachmentMentionKind(file);
        counters[kind] += 1;
        const tag = formatAttachmentMention(kind, counters[kind]);
        if (locale === 'en-US') {
            const noun =
                kind === 'image'
                    ? 'image'
                    : kind === 'video'
                      ? 'video'
                      : 'file';
            lines.push(
                `- ${tag} — attached ${noun} #${counters[kind]} (in upload order)`,
            );
        } else {
            const noun =
                kind === 'image'
                    ? 'изображение'
                    : kind === 'video'
                      ? 'видео'
                      : 'файл';
            lines.push(
                `- ${tag} — ${counters[kind]}-е прикреплённое ${noun} (по порядку)`,
            );
        }
    }

    if (locale === 'en-US') {
        return [
            'Attachments (use these tags in the prompt):',
            ...lines,
            'Tags like @image1 / @video1 / @file1 refer to attachments by type, numbered from 1 in upload order.',
        ].join('\n');
    }

    return [
        'Вложения (теги для промпта):',
        ...lines,
        'Теги @image1 / @video1 / @file1 ссылаются на вложения по типу, нумерация с 1 в порядке прикрепления.',
    ].join('\n');
}

/**
 * Prepends a numbered attachment manifesto so models map @image1 etc. to files.
 * For image-only flows `refCount` still works; prefer passing `files` when mixed.
 */
export function buildNumberedReferencePrompt(
    userPrompt: string,
    refCountOrFiles:
        | number
        | readonly Pick<AiFileInput, 'mimeType' | 'fileName'>[],
    locale: 'ru-RU' | 'en-US',
): string {
    const trimmed = userPrompt.trim();

    if (typeof refCountOrFiles !== 'number') {
        const manifest = buildAttachmentMentionManifest(
            refCountOrFiles,
            locale,
        );
        if (!manifest) {
            return trimmed;
        }
        return locale === 'en-US'
            ? `${manifest}\n\nUser task:\n${trimmed}`
            : `${manifest}\n\nЗадача пользователя:\n${trimmed}`;
    }

    const refCount = refCountOrFiles;
    if (refCount <= 0) {
        return trimmed;
    }

    const fakeFiles = Array.from({ length: refCount }, () => ({
        mimeType: 'image/jpeg',
        fileName: 'ref.jpg',
    }));
    const manifest = buildAttachmentMentionManifest(fakeFiles, locale);
    return locale === 'en-US'
        ? `${manifest}\n\nUser task:\n${trimmed}`
        : `${manifest}\n\nЗадача пользователя:\n${trimmed}`;
}

export function attachmentMentionSystemHint(
    locale: 'ru-RU' | 'en-US',
): string {
    if (locale === 'en-US') {
        return (
            'The user may mention attachments as @image1, @video1, @file1, etc. ' +
            'These tags refer to attachments by type, numbered from 1 in upload order ' +
            '(the same tags appear next to each media part).'
        );
    }
    return (
        'Пользователь может ссылаться на вложения тегами @image1, @video1, @file1 и т.п. ' +
        'Теги относятся к вложениям по типу, нумерация с 1 в порядке прикрепления ' +
        '(те же теги стоят рядом с каждым медиа-блоком).'
    );
}
