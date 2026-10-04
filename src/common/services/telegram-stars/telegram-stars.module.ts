import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '@/common/models/user';
import { PrismaModule } from '@/common/services/prisma';
import { TelegramStarsService } from './telegram-stars.service';

@Module({
    imports: [ConfigModule, PrismaModule, UserModule],
    providers: [TelegramStarsService],
    exports: [TelegramStarsService],
})
export class TelegramStarsModule {}
