import {
    Controller,
    Get,
    HttpException,
    HttpStatus,
    Post,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser, TelegramJwtGuard } from '@/common/auth';
import type { CurrentUserPayload } from '@/common/auth';
import { UserModelService } from '@/common/models/user';
import { TOKENS_NUMBER_BY_SUB_NAME } from '@/common/config';
import { SUB_PLAN_TO_COST } from '@/common/services/bot/records';
import { getDateEndSubToDb } from '@/common/services/bot/utils';
import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';

@Controller('api/subscriptions')
@UseGuards(TelegramJwtGuard)
export class SubscriptionsController {
    constructor(private readonly userModelService: UserModelService) {}

    @Get('plans')
    getPlans() {
        const paidTypes = [
            SubscribeType.LITE,
            SubscribeType.PRO,
            SubscribeType.BUSINESS,
        ] as const;

        const plans = Object.values(SubscribePlan).map((plan) => ({
            plan,
            tariffs: paidTypes.map((type) => ({
                type,
                cost: SUB_PLAN_TO_COST[plan][type],
                credits: TOKENS_NUMBER_BY_SUB_NAME[type],
            })),
        }));

        return {
            trialCredits: TOKENS_NUMBER_BY_SUB_NAME[SubscribeType.FREE],
            plans,
        };
    }

    @Post('trial')
    async activateTrial(@CurrentUser() current: CurrentUserPayload) {
        const user = await this.userModelService.getUserByTelegramId(
            current.telegramId,
        );

        if (!user) {
            throw new HttpException(
                { error: 'User not found' },
                HttpStatus.NOT_FOUND,
            );
        }

        if (user.useFreeSub) {
            throw new HttpException(
                { error: 'Trial already used' },
                HttpStatus.BAD_REQUEST,
            );
        }

        await this.userModelService.updateUserByTelegramId(current.telegramId, {
            subscribeType: SubscribeType.FREE,
            useFreeSub: true,
            subscriptionEndsAt: getDateEndSubToDb(7),
            isSubscriptionActive: true,
            lastSubscriptionType: SubscribeType.FREE,
            tokenLeft: TOKENS_NUMBER_BY_SUB_NAME[SubscribeType.FREE],
        });

        const updated = await this.userModelService.getUserByTelegramId(
            current.telegramId,
        );

        return {
            subscribeType: updated?.subscribeType,
            tokenLeft: updated?.tokenLeft,
            subscriptionEndsAt: updated?.subscriptionEndsAt,
            isSubscriptionActive: updated?.isSubscriptionActive,
        };
    }
}
