import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { getCorsConfig } from './core';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true,
    });

    const logger = app.get(Logger);
    app.useLogger(logger);

    const configService = app.get(ConfigService);
    const corsConfig = getCorsConfig(configService);

    if (
        configService.get<string>('NODE_ENV') === 'production' &&
        !configService.get<string>('MINI_APP_ORIGIN')
    ) {
        logger.warn(
            'MINI_APP_ORIGIN is not set — browser CORS requests from mini-app will be blocked',
        );
    }

    app.enableCors(corsConfig);

    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
        }),
    );

    await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
