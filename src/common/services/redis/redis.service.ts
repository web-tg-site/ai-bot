import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly client: ReturnType<typeof createClient> | null;

    constructor(
        @InjectPinoLogger(RedisService.name)
        private readonly logger: PinoLogger,
        configService: ConfigService,
    ) {
        const redisUrl = configService.get<string>('REDIS_URL');

        if (!redisUrl) {
            this.logger.warn(
                'REDIS_URL is not set — using in-memory session fallback',
            );
            this.client = null;
            return;
        }

        this.client = createClient({ url: redisUrl });

        this.client.on('error', (err: unknown) => {
            this.logger.error(
                `Redis error: ${err instanceof Error ? err.message : String(err)}`,
            );
        });
    }

    getClient(): ReturnType<typeof createClient> | null {
        return this.client;
    }

    async onModuleDestroy() {
        if (this.client) {
            await this.client.quit();
        }
    }
}
