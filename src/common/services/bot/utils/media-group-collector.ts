import { AiFileInput } from '@/common/services/ai/types';

type MediaGroupBatch = {
    files: AiFileInput[];
    prompt?: string;
    timer: ReturnType<typeof setTimeout>;
    finalize: () => Promise<void>;
};

const batches = new Map<string, MediaGroupBatch>();

const MEDIA_GROUP_DEBOUNCE_MS = 900;

export function collectMediaGroupMessage(params: {
    mediaGroupId: string;
    files: AiFileInput[];
    prompt?: string;
    finalize: (batch: {
        files: AiFileInput[];
        prompt?: string;
    }) => Promise<void>;
    onError?: (error: unknown) => Promise<void>;
}): void {
    const existing = batches.get(params.mediaGroupId);

    const wrapFinalize = (batch: MediaGroupBatch) => async () => {
        try {
            await params.finalize({
                files: batch.files,
                prompt: batch.prompt,
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
        existing.files.push(...params.files);
        if (params.prompt?.trim()) {
            existing.prompt = params.prompt.trim();
        }
        existing.timer = setTimeout(() => {
            void flushMediaGroup(params.mediaGroupId);
        }, MEDIA_GROUP_DEBOUNCE_MS);
        return;
    }

    const batch: MediaGroupBatch = {
        files: [...params.files],
        prompt: params.prompt?.trim() || undefined,
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
