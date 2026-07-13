import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TelegramAuthDto } from './dto/telegram-auth.dto';

@Controller('api/auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('telegram')
    authenticate(@Body() body: TelegramAuthDto) {
        return this.authService.authenticateByInitData(body.initData);
    }
}
