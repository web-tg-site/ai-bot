import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { UserModule } from '@/common/models/user';
import { PrismaModule } from '@/common/services/prisma';
import { AntilopayService } from './antilopay.service';

@Module({
    imports: [ConfigModule, HttpModule, PrismaModule, UserModule],
    providers: [AntilopayService],
    exports: [AntilopayService],
})
export class AntilopayModule {}
