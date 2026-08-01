import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

function normalizeOrigin(value: string): string {
    return value.trim().replace(/\/$/, '');
}

function parseOrigins(value?: string): string[] {
    if (!value) {
        return [];
    }

    return value.split(',').map(normalizeOrigin).filter(Boolean);
}

export function getCorsConfig(configService: ConfigService): CorsOptions {
    const origins = parseOrigins(configService.get<string>('MINI_APP_ORIGIN'));
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    return {
        origin: (requestOrigin, callback) => {
            if (!requestOrigin) {
                callback(null, true);
                return;
            }

            const normalized = normalizeOrigin(requestOrigin);

            if (!isProduction && origins.length === 0) {
                callback(null, true);
                return;
            }

            if (origins.includes(normalized)) {
                callback(null, true);
                return;
            }

            callback(null, false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    };
}
