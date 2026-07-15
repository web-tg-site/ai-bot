import { randomUUID } from 'crypto';
import { AiFileInput } from '@/common/services/ai/types';
import { StoredReference } from '@/common/services/ai/types/ai-session-state.type';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';

export async function serializeReference(
    file: AiFileInput,
): Promise<StoredReference> {
    const compressed = await compressReferenceImage(file);

    return {
        id: randomUUID(),
        data: compressed.buffer.toString('base64'),
        mimeType: compressed.mimeType,
        fileName: compressed.fileName,
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

export function buildNumberedReferencePrompt(
    userPrompt: string,
    refCount: number,
    locale: 'ru-RU' | 'en-US',
): string {
    if (refCount <= 0) {
        return userPrompt.trim();
    }

    const lines =
        locale === 'en-US'
            ? [
                  'Reference images (in attachment order):',
                  ...Array.from(
                      { length: refCount },
                      (_, index) =>
                          `- Image ${index + 1} — reference photo #${index + 1}`,
                  ),
                  '',
                  'User task:',
                  userPrompt.trim(),
              ]
            : [
                  'Референсные изображения (по порядку прикрепления):',
                  ...Array.from(
                      { length: refCount },
                      (_, index) =>
                          `- Изображение ${index + 1} — ${index + 1}-е прикреплённое фото`,
                  ),
                  '',
                  'Задача пользователя:',
                  userPrompt.trim(),
              ];

    return lines.join('\n');
}

export function getReferenceLabel(
    index: number,
    locale: 'ru-RU' | 'en-US',
): string {
    return locale === 'en-US'
        ? `[Reference ${index + 1}]`
        : `[Референс ${index + 1}]`;
}
