import { Injectable } from '@nestjs/common';
import { PrismaClient } from 'src/generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient {
    constructor(private readonly configService: ConfigService) {
        const url = configService.get<string>('DATABASE_URL');

        if (!url) {
            throw new Error('DATABASE_URL is not set');
        }

        const adapter = new PrismaPg(url);

        super({ adapter });
    }
}
