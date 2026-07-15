import { PrismaService } from '@/common/services/prisma';
import { Prisma } from '@/generated/prisma/client';
import { Injectable } from '@nestjs/common';
import {
    SubscribeType,
    SubscribePlan,
    UserLanguage,
} from '@/generated/prisma/enums';
import {
    LONG_STANDING_ACTIVITY_DAYS,
    LongStandingActivityUsers,
    PAID_SUBSCRIPTION_TYPES,
    ProcessSubscriptionsEndingTodayResult,
    RunningOutSubscriptionUser,
    RunningOutSubscriptionUsers,
    UsersWithoutFreeSubscription,
} from './types';
import { WHERE_FOR_GET_USER_WITH_NEED_TO_GET_SUBS_AND_UPDATE_CONFIG } from './config';
import {
    TOKENS_NUMBER_BY_SUB_NAME,
    getSubscriptionDurationDays,
} from '@/common/config';

@Injectable()
export class UserModelService {
    constructor(private readonly prismaService: PrismaService) {}

    // Получения
    public async getUserByTelegramId(telegramId: string) {
        return await this.prismaService.user.findUnique({
            where: {
                telegramId,
            },
        });
    }

    public async getUsersWithLongStandingActivityWithoutSubscription(): Promise<LongStandingActivityUsers> {
        const twoDaysBounds = this.getDayBounds(
            LONG_STANDING_ACTIVITY_DAYS.two_days,
            'past',
        );
        const weekBounds = this.getDayBounds(
            LONG_STANDING_ACTIVITY_DAYS.week,
            'past',
        );
        const monthBounds = this.getDayBounds(
            LONG_STANDING_ACTIVITY_DAYS.month,
            'past',
        );

        const users = await this.prismaService.user.findMany({
            where: {
                OR: [
                    {
                        lastActivityAt: {
                            gte: twoDaysBounds.start,
                            lte: twoDaysBounds.end,
                        },
                    },
                    {
                        lastActivityAt: {
                            gte: weekBounds.start,
                            lte: weekBounds.end,
                        },
                    },
                    {
                        lastActivityAt: {
                            gte: monthBounds.start,
                            lte: monthBounds.end,
                        },
                    },
                ],
                subscribeType: SubscribeType.NOT_SUBSCRIBED,
                lastSubscriptionType: null,
            },
            select: {
                telegramId: true,
                lastActivityAt: true,
            },
        });

        return {
            2: users.filter((user) =>
                this.isDateWithinBounds(user.lastActivityAt, twoDaysBounds),
            ),
            7: users.filter((user) =>
                this.isDateWithinBounds(user.lastActivityAt, weekBounds),
            ),
            30: users.filter((user) =>
                this.isDateWithinBounds(user.lastActivityAt, monthBounds),
            ),
        };
    }

    public async getUsersWithoutFreeSubscription(): Promise<UsersWithoutFreeSubscription> {
        const twoDaysBounds = this.getDayBounds(
            LONG_STANDING_ACTIVITY_DAYS.two_days,
            'past',
        );
        const weekBounds = this.getDayBounds(
            LONG_STANDING_ACTIVITY_DAYS.week,
            'past',
        );

        const users = await this.prismaService.user.findMany({
            where: {
                OR: [
                    {
                        subscriptionEndsAt: {
                            gte: twoDaysBounds.start,
                            lte: twoDaysBounds.end,
                        },
                    },
                    {
                        subscriptionEndsAt: {
                            gte: weekBounds.start,
                            lte: weekBounds.end,
                        },
                    },
                ],
                lastSubscriptionType: SubscribeType.FREE,
                isSubscriptionActive: false,
                subscribeType: SubscribeType.NOT_SUBSCRIBED,
            },
            select: {
                telegramId: true,
                subscriptionEndsAt: true,
            },
        });

        return {
            2: users.filter((user) =>
                this.isDateWithinBounds(user.subscriptionEndsAt, twoDaysBounds),
            ),
            7: users.filter((user) =>
                this.isDateWithinBounds(user.subscriptionEndsAt, weekBounds),
            ),
        };
    }

    public async getUserWhoRunningOutSubscription(): Promise<RunningOutSubscriptionUsers> {
        const threeDaysBounds = this.getDayBounds(3, 'future');
        const dayBounds = this.getDayBounds(1, 'future');

        const users = await this.prismaService.user.findMany({
            where: {
                OR: [
                    {
                        subscriptionEndsAt: {
                            not: null,
                            gte: threeDaysBounds.start,
                            lte: threeDaysBounds.end,
                        },
                    },
                    {
                        subscriptionEndsAt: {
                            not: null,
                            gte: dayBounds.start,
                            lte: dayBounds.end,
                        },
                    },
                ],
                subscribeType: {
                    in: [...PAID_SUBSCRIPTION_TYPES],
                },
                isSubscriptionActive: true,
            },
            select: {
                telegramId: true,
                subscriptionEndsAt: true,
            },
        });

        return {
            3: users.filter((user): user is RunningOutSubscriptionUser =>
                this.isDateWithinBounds(
                    user.subscriptionEndsAt,
                    threeDaysBounds,
                ),
            ),
            1: users.filter((user): user is RunningOutSubscriptionUser =>
                this.isDateWithinBounds(user.subscriptionEndsAt, dayBounds),
            ),
        };
    }

    public async processSubscriptionsEndingToday(): Promise<ProcessSubscriptionsEndingTodayResult> {
        const todayBounds = this.getDayBounds(0, 'future');

        const users = await this.prismaService.user.findMany({
            where: {
                subscriptionEndsAt: {
                    gte: todayBounds.start,
                    lte: todayBounds.end,
                },
            },
            include: {
                nextSubscription: true,
            },
        });

        const activatedNextSubUsers: ProcessSubscriptionsEndingTodayResult['activatedNextSubUsers'] =
            [];
        const deactivatedUsers: ProcessSubscriptionsEndingTodayResult['deactivatedUsers'] =
            [];

        const transactionOps = users.flatMap((user) => {
            if (user.nextSubscription) {
                const nextSub = user.nextSubscription;

                activatedNextSubUsers.push({
                    telegramId: user.telegramId,
                    subscribeType: nextSub.subType,
                    subscriptionEndsAt: nextSub.subscriptionEndsAt,
                });

                return [
                    this.prismaService.user.update({
                        where: { id: user.id },
                        data: {
                            subscribeType: nextSub.subType,
                            subscribePlan: nextSub.subPlan,
                            subscriptionStartsAt: new Date(),
                            subscriptionEndsAt: nextSub.subscriptionEndsAt,
                            isSubscriptionActive: true,
                            lastSubscriptionType: user.subscribeType,
                            tokenLeft:
                                TOKENS_NUMBER_BY_SUB_NAME[nextSub.subType],
                            lastTokenIssueAt: new Date(),
                        },
                    }),
                    this.prismaService.nextSubscriptionOfUser.delete({
                        where: { userId: user.id },
                    }),
                ];
            }

            deactivatedUsers.push({
                telegramId: user.telegramId,
                subscribeType: user.subscribeType,
            });

            return [
                this.prismaService.user.update({
                    where: { id: user.id },
                    data: {
                        isSubscriptionActive: false,
                        subscribeType: SubscribeType.NOT_SUBSCRIBED,
                        subscriptionEndsAt: null,
                        lastSubscriptionType: user.subscribeType,
                        subscribePlan: null,
                        tokenLeft: 0,
                    },
                }),
            ];
        });

        if (transactionOps.length > 0) {
            await this.prismaService.$transaction(transactionOps);
        }

        return { activatedNextSubUsers, deactivatedUsers };
    }

    public async getUsersWithNeedToGetSubs(): Promise<
        { telegramId: string; subscribeType: SubscribeType }[]
    > {
        const oneMonthAgoBounds = this.getMonthBounds(1, 'past');
        const oneMonthFromNowBounds = this.getMonthBounds(1, 'future');

        return await this.prismaService.user.findMany({
            where: {
                ...WHERE_FOR_GET_USER_WITH_NEED_TO_GET_SUBS_AND_UPDATE_CONFIG(
                    oneMonthFromNowBounds,
                    oneMonthAgoBounds,
                ),
            },
            select: {
                telegramId: true,
                subscribeType: true,
            },
        });
    }

    // Создания
    public async createUser(
        telegramId: string,
        telegramUsername?: string,
        language: UserLanguage = UserLanguage.RU,
    ) {
        await this.prismaService.user.create({
            data: {
                telegramId,
                telegramUsername,
                language,
            },
        });
    }

    // Обновления
    public async updateUserByTelegramId(
        telegramId: string,
        data: Prisma.UserUpdateInput,
    ) {
        await this.prismaService.user.update({
            where: {
                telegramId,
            },
            data,
        });
    }

    public async updateUserLastActivityAt(telegramId: string) {
        await this.prismaService.user.update({
            where: {
                telegramId,
            },
            data: {
                lastActivityAt: new Date(),
            },
        });
    }

    public async updateUserLanguage(
        telegramId: string,
        language: UserLanguage,
    ) {
        await this.prismaService.user.update({
            where: {
                telegramId,
            },
            data: {
                language,
            },
        });
    }

    public async updateUserToken(telegramId: string, token: number) {
        await this.prismaService.user.update({
            where: {
                telegramId,
            },
            data: {
                tokenLeft: token,
            },
        });
    }

    public async deductTokens(
        telegramId: string,
        amount: number,
    ): Promise<{ success: boolean; balance: number }> {
        const result = await this.prismaService.user.updateMany({
            where: {
                telegramId,
                tokenLeft: { gte: amount },
            },
            data: {
                tokenLeft: { decrement: amount },
            },
        });

        if (result.count === 0) {
            const user = await this.getUserByTelegramId(telegramId);
            return { success: false, balance: user?.tokenLeft ?? 0 };
        }

        const user = await this.getUserByTelegramId(telegramId);
        return { success: true, balance: user?.tokenLeft ?? 0 };
    }

    public async creditTokens(
        telegramId: string,
        amount: number,
    ): Promise<{ success: boolean; balance: number }> {
        if (amount <= 0) {
            const user = await this.getUserByTelegramId(telegramId);
            return { success: true, balance: user?.tokenLeft ?? 0 };
        }

        await this.prismaService.user.update({
            where: { telegramId },
            data: {
                tokenLeft: { increment: amount },
            },
        });

        const user = await this.getUserByTelegramId(telegramId);
        return { success: true, balance: user?.tokenLeft ?? 0 };
    }

    public async updateUserTokenForUsersWithNeedToGetSubs() {
        const users = await this.getUsersWithNeedToGetSubs();

        await this.prismaService.$transaction(
            users.map((user) =>
                this.prismaService.user.update({
                    where: { telegramId: user.telegramId },
                    data: {
                        tokenLeft:
                            TOKENS_NUMBER_BY_SUB_NAME[user.subscribeType],
                        lastTokenIssueAt: new Date(),
                    },
                }),
            ),
        );

        return users.map((user) => {
            return {
                telegramId: user.telegramId,
                tokenLeft: TOKENS_NUMBER_BY_SUB_NAME[user.subscribeType],
            };
        });
    }

    public async activatePaidSubscription(
        userId: string,
        subscribeType: SubscribeType,
        subscribePlan: SubscribePlan,
    ): Promise<{ subscriptionEndsAt: Date }> {
        return this.prismaService.$transaction((tx) =>
            this.activatePaidSubscriptionInTransaction(
                tx,
                userId,
                subscribeType,
                subscribePlan,
            ),
        );
    }

    public async activatePaidSubscriptionInTransaction(
        tx: Prisma.TransactionClient,
        userId: string,
        subscribeType: SubscribeType,
        subscribePlan: SubscribePlan,
    ): Promise<{ subscriptionEndsAt: Date }> {
        const user = await tx.user.findUniqueOrThrow({
            where: { id: userId },
        });

        const now = new Date();
        const durationDays = getSubscriptionDurationDays(subscribePlan);

        const hasActiveSubscription =
            user.isSubscriptionActive &&
            user.subscriptionEndsAt &&
            user.subscriptionEndsAt > now;

        const subscriptionEndsAt = new Date(
            hasActiveSubscription ? user.subscriptionEndsAt! : now,
        );
        subscriptionEndsAt.setDate(subscriptionEndsAt.getDate() + durationDays);

        await tx.user.update({
            where: { id: userId },
            data: {
                subscribeType,
                subscribePlan,
                subscriptionStartsAt: hasActiveSubscription
                    ? (user.subscriptionStartsAt ?? now)
                    : now,
                subscriptionEndsAt,
                isSubscriptionActive: true,
                lastSubscriptionType: user.subscribeType,
                tokenLeft: TOKENS_NUMBER_BY_SUB_NAME[subscribeType],
                lastTokenIssueAt: now,
            },
        });

        return { subscriptionEndsAt };
    }

    // Хелперы
    private getDayBounds(daysOffset: number, direction: 'past' | 'future') {
        const targetDate = new Date();
        targetDate.setDate(
            targetDate.getDate() +
                (direction === 'past' ? -daysOffset : daysOffset),
        );

        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    private getMonthBounds(monthsOffset: number, direction: 'past' | 'future') {
        const targetDate = new Date();
        targetDate.setMonth(
            targetDate.getMonth() +
                (direction === 'past' ? -monthsOffset : monthsOffset),
        );

        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    private isDateWithinBounds(
        date: Date | null,
        bounds: { start: Date; end: Date },
    ): date is Date {
        return !!date && date >= bounds.start && date <= bounds.end;
    }
}
