import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '@/common/models/user';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
    imports: [ConfigModule, UserModule],
    controllers: [AuthController],
    providers: [AuthService],
})
export class AuthModule {}
