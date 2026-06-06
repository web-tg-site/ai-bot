import { ConfigService } from '@nestjs/config';

export const pinoFactoryConfig = (configService: ConfigService) => ({
    pinoHttp: {
        level: configService.get<string>('LOG_LEVEL', 'info'),
        transport:
            configService.get<string>('NODE_ENV') !== 'production'
                ? {
                      target: 'pino-pretty',
                      options: {
                          colorize: true,
                          singleLine: true,
                          translateTime: 'SYS:HH:MM:ss',
                      },
                  }
                : undefined,
    },
});
