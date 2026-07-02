import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    ActivatedNextSubscriptionUser,
    RunningOutSubscriptionUser,
    UserModelService,
    UserWithTelegramId,
} from '@/common/models/user';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    BotService,
    FREE_SUB_END_TEXTS,
    generateSubActivateText,
    LONG_STADING_ACITIVITY_TEXTS,
    NEW_TOKENS_TEXT,
    RENEW_SUB_TEXT_WITH_DAYS,
} from '@/common/services/bot';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RENEW_SUB_TEXT, renewSubKeyboard } from '@/common/services/bot';
import { subActivateKeyboard } from '@/common/services/bot/keyboards';
import { SUB_TYPE_TO_TEXT } from '@/common/services/bot/records';
import { SubscribeType } from '@/generated/prisma/enums';

@Injectable()
export class SubscriptionCron implements OnModuleInit {
    constructor(
        private readonly botService: BotService,
        private readonly userModelService: UserModelService,
        @InjectPinoLogger(SubscriptionCron.name)
        private readonly logger: PinoLogger,
    ) {}

    onModuleInit() {
        this.logger.info('Subscription cron started');
    }

    // Оповещения
    @Cron(CronExpression.EVERY_DAY_AT_10AM, { name: 'long-standing-activity' })
    public async handleLongStandingActivity() {
        this.logger.info('Standing activity cron started');

        const usersByPeriod =
            await this.userModelService.getUsersWithLongStandingActivityWithoutSubscription();

        for (const days of [2, 7, 30] as const) {
            await this.sendLongStandingActivityMessageToUsers(
                usersByPeriod[days],
            );
        }

        this.logger.info('Standing activity cron finished');
    }

    @Cron(CronExpression.EVERY_DAY_AT_11AM, {
        name: 'running-out-free-subscription',
    })
    public async handleUserWhoRunningOutFreeSubscription() {
        this.logger.info('User who running out free subscription cron started');

        const usersByPeriod =
            await this.userModelService.getUsersWithoutFreeSubscription();

        for (const days of [2, 7] as const) {
            await this.sendLongStandingActivityMessageToUsersByPeriod(
                usersByPeriod[days],
                days,
            );
        }

        this.logger.info(
            'User who running out free subscription cron finished',
        );
    }

    @Cron(CronExpression.EVERY_DAY_AT_NOON, {
        name: 'running-out-subscription',
    })
    public async handleUserWhoRunningOutSubscription() {
        this.logger.info('User who running out subscription cron started');

        const usersByPeriod =
            await this.userModelService.getUserWhoRunningOutSubscription();

        for (const days of [3, 1] as const) {
            await this.sendUserWhoRunningOutSubscriptionMessageToUsers(
                usersByPeriod[days],
                days,
            );
        }

        this.logger.info('User who running out subscription cron finished');
    }

    // Проверка подписок, их снятие и продление
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'subscription-check' })
    public async handleSubscriptionCheck() {
        this.logger.info('Subscription check cron started');

        const { activatedNextSubUsers, deactivatedUsers } =
            await this.userModelService.processSubscriptionsEndingToday();

        // Отправка сообщений о окончании подписок
        await this.sendLongStandingActivityMessageToUsers(
            deactivatedUsers.filter(
                (user) => user.subscribeType !== SubscribeType.FREE,
            ),
        );
        await this.sendMessageToUsersWhoFreeSubEnd(
            deactivatedUsers.filter(
                (user) => user.subscribeType === SubscribeType.FREE,
            ),
            0,
        );

        // Продление токенов для пользователей через каждый месяц действующей подписки
        const usersWithNewTokens =
            await this.userModelService.updateUserTokenForUsersWithNeedToGetSubs();

        // Отправка сообщений о продлении токенов
        await this.sendMessageToUsersWithNewTokens(usersWithNewTokens);

        // Активация следующей подписки
        await this.sendSubActivatedMessageToUsers(activatedNextSubUsers);

        this.logger.info('Subscription check cron finished');
    }

    private async sendLongStandingActivityMessageToUsers(
        users: UserWithTelegramId[],
    ) {
        for (const user of users) {
            await this.botService.sendMessage(user.telegramId, RENEW_SUB_TEXT, {
                ...renewSubKeyboard,
                parse_mode: 'HTML',
            });
        }
    }

    private async sendMessageToUsersWithNewTokens(
        users: { telegramId: string; tokenLeft: number }[],
    ) {
        for (const user of users) {
            await this.botService.sendMessage(
                user.telegramId,
                NEW_TOKENS_TEXT(user.tokenLeft),
                {
                    parse_mode: 'HTML',
                },
            );
        }
    }

    private async sendLongStandingActivityMessageToUsersByPeriod(
        users: UserWithTelegramId[],
        days: 2 | 7 | 30,
    ) {
        for (const user of users) {
            await this.botService.sendMessage(
                user.telegramId,
                LONG_STADING_ACITIVITY_TEXTS[days],
                {
                    ...renewSubKeyboard,
                    parse_mode: 'HTML',
                },
            );
        }
    }

    private async sendMessageToUsersWhoFreeSubEnd(
        users: UserWithTelegramId[],
        days: 0 | 2 | 7,
    ) {
        for (const user of users) {
            await this.botService.sendMessage(
                user.telegramId,
                FREE_SUB_END_TEXTS[days],
                {
                    ...renewSubKeyboard,
                    parse_mode: 'HTML',
                },
            );
        }
    }

    private async sendSubActivatedMessageToUsers(
        users: ActivatedNextSubscriptionUser[],
    ) {
        for (const user of users) {
            const endsAt = user.subscriptionEndsAt.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });

            await this.botService.sendMessage(
                user.telegramId,
                generateSubActivateText(
                    SUB_TYPE_TO_TEXT[user.subscribeType],
                    endsAt,
                ),
                {
                    ...subActivateKeyboard,
                    parse_mode: 'HTML',
                },
            );
        }
    }

    private async sendUserWhoRunningOutSubscriptionMessageToUsers(
        users: RunningOutSubscriptionUser[],
        days: 3 | 1,
    ) {
        for (const user of users) {
            await this.botService.sendMessage(
                user.telegramId,
                RENEW_SUB_TEXT_WITH_DAYS(days, user.subscriptionEndsAt),
                {
                    ...renewSubKeyboard,
                    parse_mode: 'HTML',
                },
            );
        }
    }
}
