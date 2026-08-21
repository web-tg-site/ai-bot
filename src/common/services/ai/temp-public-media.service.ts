import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

type TempMediaEntry = {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    expiresAt: number;
};

const TTL_MS = 2 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class TempPublicMediaService implements OnModuleDestroy {
    private readonly store = new Map<string, TempMediaEntry>();
    private readonly cleanupTimer: NodeJS.Timeout;

    constructor(
        @InjectPinoLogger(TempPublicMediaService.name)
        private readonly logger: PinoLogger,
    ) {
        this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
        this.cleanupTimer.unref?.();
    }

    onModuleDestroy() {
        clearInterval(this.cleanupTimer);
        this.store.clear();
    }

    put(file: {
        buffer: Buffer;
        mimeType: string;
        fileName?: string;
    }): string {
        const id = randomUUID();
        this.store.set(id, {
            buffer: file.buffer,
            mimeType: file.mimeType,
            fileName: file.fileName ?? `media-${id}`,
            expiresAt: Date.now() + TTL_MS,
        });
        return id;
    }

    get(id: string): TempMediaEntry | undefined {
        const entry = this.store.get(id);
        if (!entry) {
            return undefined;
        }
        if (entry.expiresAt <= Date.now()) {
            this.store.delete(id);
            return undefined;
        }
        return entry;
    }

    private cleanup() {
        const now = Date.now();
        let removed = 0;
        for (const [id, entry] of this.store) {
            if (entry.expiresAt <= now) {
                this.store.delete(id);
                removed += 1;
            }
        }
        if (removed > 0) {
            this.logger.debug({ removed }, 'Temp public media cleanup');
        }
    }
}
