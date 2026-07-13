import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

function parseOrigins(value?: string): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

export function getCorsConfig(configService: ConfigService): CorsOptions {
    const origins = parseOrigins(configService.get<string>('MINI_APP_ORIGIN'));
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    return {
        origin: origins.length > 0 ? origins : isProduction ? false : true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    };
}
