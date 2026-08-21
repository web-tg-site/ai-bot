import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

type TempMediaEntry = {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    expiresAt: number;
    jobId?: string;
};

const TTL_MS = 2 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class TempPublicMediaService implements OnModuleDestroy {
    private readonly store = new Map<string, TempMediaEntry>();
    private readonly jobIndex = new Map<string, string>();
    private readonly cleanupTimer: NodeJS.Timeout;

    constructor(
        @InjectPinoLogger(TempPublicMediaService.name)
        private readonly logger: PinoLogger,
    ) {
        this.cleanupTimer = setInterval(
            () => this.cleanup(),
            CLEANUP_INTERVAL_MS,
        );
        this.cleanupTimer.unref?.();
    }

    onModuleDestroy() {
        clearInterval(this.cleanupTimer);
        this.store.clear();
        this.jobIndex.clear();
    }

    put(file: {
        buffer: Buffer;
        mimeType: string;
        fileName?: string;
        jobId?: string;
    }): string {
        const id = randomUUID();
        if (file.jobId) {
            const previous = this.jobIndex.get(file.jobId);
            if (previous) {
                this.store.delete(previous);
            }
            this.jobIndex.set(file.jobId, id);
        }
        this.store.set(id, {
            buffer: file.buffer,
            mimeType: file.mimeType,
            fileName: file.fileName ?? `media-${id}`,
            expiresAt: Date.now() + TTL_MS,
            jobId: file.jobId,
        });
        return id;
    }

    get(id: string): TempMediaEntry | undefined {
        const entry = this.store.get(id);
        if (!entry) {
            return undefined;
        }
        if (entry.expiresAt <= Date.now()) {
            this.deleteEntry(id, entry);
            return undefined;
        }
        return entry;
    }

    getByJobId(jobId: string): TempMediaEntry | undefined {
        const id = this.jobIndex.get(jobId);
        if (!id) {
            return undefined;
        }
        return this.get(id);
    }

    private deleteEntry(id: string, entry: TempMediaEntry) {
        this.store.delete(id);
        if (entry.jobId && this.jobIndex.get(entry.jobId) === id) {
            this.jobIndex.delete(entry.jobId);
        }
    }

    private cleanup() {
        const now = Date.now();
        let removed = 0;
        for (const [id, entry] of this.store) {
            if (entry.expiresAt <= now) {
                this.deleteEntry(id, entry);
                removed += 1;
            }
        }
        if (removed > 0) {
            this.logger.debug({ removed }, 'Temp public media cleanup');
        }
    }
}
