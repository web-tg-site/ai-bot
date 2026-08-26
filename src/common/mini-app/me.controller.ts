import {
    Body,
    Controller,
    Get,
    HttpException,
    HttpStatus,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsOptional } from 'class-validator';
import { CurrentUser, TelegramJwtGuard } from '@/common/auth';
import type { CurrentUserPayload } from '@/common/auth';
import { UserModelService } from '@/common/models/user';
import { UserLanguage } from '@/generated/prisma/enums';

class UpdateMeDto {
    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsIn(['RU', 'EN'])
    language?: 'RU' | 'EN';

    @IsOptional()
    @IsBoolean()
    autoModelFailover?: boolean;
}

@Controller('api/me')
@UseGuards(TelegramJwtGuard)
export class MeController {
    constructor(private readonly userModelService: UserModelService) {}

    @Get()
    async getMe(@CurrentUser() current: CurrentUserPayload) {
        const user = await this.userModelService.getUserByTelegramId(
            current.telegramId,
        );

        if (!user) {
            throw new HttpException(
                { error: 'Пользователь не найден' },
                HttpStatus.NOT_FOUND,
            );
        }

        return {
            id: user.id,
            telegramId: user.telegramId,
            username: user.telegramUsername,
            subscribeType: user.subscribeType,
            subscribePlan: user.subscribePlan,
            isSubscriptionActive: user.isSubscriptionActive,
            subscriptionEndsAt: user.subscriptionEndsAt,
            tokenLeft: user.tokenLeft,
            useFreeSub: user.useFreeSub,
            canActivateTrial: !user.useFreeSub,
            email: user.email,
            language: user.language,
            hasCompletedOnboarding: user.hasCompletedOnboarding,
            autoModelFailover: user.autoModelFailover,
        };
    }

    @Patch()
    async updateMe(
        @CurrentUser() current: CurrentUserPayload,
        @Body() body: UpdateMeDto,
    ) {
        if (body.email) {
            await this.userModelService.updateUserByTelegramId(
                current.telegramId,
                { email: body.email },
            );
        }

        if (body.language === 'RU' || body.language === 'EN') {
            await this.userModelService.updateUserLanguage(
                current.telegramId,
                body.language === 'EN' ? UserLanguage.EN : UserLanguage.RU,
            );
        }

        if (typeof body.autoModelFailover === 'boolean') {
            await this.userModelService.updateUserByTelegramId(
                current.telegramId,
                { autoModelFailover: body.autoModelFailover },
            );
        }

        const user = await this.userModelService.getUserByTelegramId(
            current.telegramId,
        );

        return {
            email: user?.email,
            language: user?.language,
            autoModelFailover: user?.autoModelFailover,
        };
    }

    @Post('onboarding/complete')
    async completeOnboarding(@CurrentUser() current: CurrentUserPayload) {
        await this.userModelService.updateUserByTelegramId(current.telegramId, {
            hasCompletedOnboarding: true,
        });

        return { hasCompletedOnboarding: true };
    }
}
