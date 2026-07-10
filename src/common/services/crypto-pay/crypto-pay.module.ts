import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { UserModule } from '@/common/models/user';
import { PrismaModule } from '@/common/services/prisma';
import { CryptoPayService } from './crypto-pay.service';

@Module({
    imports: [ConfigModule, HttpModule, PrismaModule, UserModule],
    providers: [CryptoPayService],
    exports: [CryptoPayService],
})
export class CryptoPayModule {}
