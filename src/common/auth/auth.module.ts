import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '@/common/models/user';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt-token.service';
import { TelegramJwtGuard } from './telegram-jwt.guard';

@Module({
    imports: [ConfigModule, UserModule],
    controllers: [AuthController],
    providers: [AuthService, JwtTokenService, TelegramJwtGuard],
    exports: [JwtTokenService, TelegramJwtGuard, AuthService],
})
export class AuthModule {}
