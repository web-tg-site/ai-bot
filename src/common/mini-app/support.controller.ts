import { Controller, Get, UseGuards } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TelegramJwtGuard } from '@/common/auth';
import { BotService } from '@/common/services/bot';
import { SUPPORT_DOCUMENTS } from '@/common/config';
import {
    SUPPORT_EMAIL,
    TECH_SUPPORT_START_PAYLOAD,
} from '@/common/services/bot/utils/format-tech-support';

@Controller('api/support')
@UseGuards(TelegramJwtGuard)
export class SupportController {
    constructor(private readonly moduleRef: ModuleRef) {}

    @Get('info')
    getInfo() {
        const username = this.getBotUsername();

        return {
            email: SUPPORT_EMAIL,
            telegramUrl: username
                ? `https://t.me/${username}?start=${TECH_SUPPORT_START_PAYLOAD}`
                : undefined,
            documents: SUPPORT_DOCUMENTS,
        };
    }

    private getBotUsername(): string | undefined {
        try {
            return this.moduleRef
                .get(BotService, { strict: false })
                .getUsername();
        } catch {
            return undefined;
        }
    }
}
