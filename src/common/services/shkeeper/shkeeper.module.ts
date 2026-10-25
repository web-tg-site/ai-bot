import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { UserModule } from '@/common/models/user';
import { PrismaModule } from '@/common/services/prisma';
import { ShkeeperService } from './shkeeper.service';

@Module({
    imports: [ConfigModule, HttpModule, PrismaModule, UserModule],
    providers: [ShkeeperService],
    exports: [ShkeeperService],
})
export class ShkeeperModule {}
