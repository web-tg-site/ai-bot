import { AiFileInput } from '@/common/services/ai/types';

type MediaGroupEntry = {
    messageId: number;
    files: AiFileInput[];
    prompt?: string;
};

type MediaGroupBatch = {
    entries: MediaGroupEntry[];
    timer: ReturnType<typeof setTimeout>;
    finalize: () => Promise<void>;
};

const batches = new Map<string, MediaGroupBatch>();

const MEDIA_GROUP_DEBOUNCE_MS = 900;

export function collectMediaGroupMessage(params: {
    mediaGroupId: string;
    messageId: number;
    files: AiFileInput[];
    prompt?: string;
    finalize: (batch: {
        files: AiFileInput[];
        prompt?: string;
    }) => Promise<void>;
    onError?: (error: unknown) => Promise<void>;
}): void {
    const existing = batches.get(params.mediaGroupId);
    const entry: MediaGroupEntry = {
        messageId: params.messageId,
        files: [...params.files],
        prompt: params.prompt?.trim() || undefined,
    };

    const wrapFinalize = (batch: MediaGroupBatch) => async () => {
        try {
            const sortedEntries = [...batch.entries].sort(
                (left, right) => left.messageId - right.messageId,
            );
            const files = sortedEntries.flatMap((item) => item.files);
            const prompt = sortedEntries.find((item) => item.prompt)?.prompt;

            await params.finalize({
                files,
                prompt,
            });
        } catch (error) {
            if (params.onError) {
                await params.onError(error);
            } else {
                throw error;
            }
        }
    };

    if (existing) {
        clearTimeout(existing.timer);
        existing.entries.push(entry);
        existing.timer = setTimeout(() => {
            void flushMediaGroup(params.mediaGroupId);
        }, MEDIA_GROUP_DEBOUNCE_MS);
        return;
    }

    const batch: MediaGroupBatch = {
        entries: [entry],
        finalize: async () => {},
        timer: setTimeout(() => {
            void flushMediaGroup(params.mediaGroupId);
        }, MEDIA_GROUP_DEBOUNCE_MS),
    };

    batch.finalize = wrapFinalize(batch);
    batches.set(params.mediaGroupId, batch);
}

async function flushMediaGroup(mediaGroupId: string) {
    const batch = batches.get(mediaGroupId);
    if (!batch) {
        return;
    }

    batches.delete(mediaGroupId);
    clearTimeout(batch.timer);
    await batch.finalize();
}
