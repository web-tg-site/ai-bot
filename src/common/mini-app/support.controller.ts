import { Controller, Get, UseGuards } from '@nestjs/common';
import { TelegramJwtGuard } from '@/common/auth';

@Controller('api/support')
@UseGuards(TelegramJwtGuard)
export class SupportController {
    @Get('info')
    getInfo() {
        return {
            email: 'support@project-ai.com',
            telegramUrl: 'https://t.me/endora_support',
        };
    }
}
