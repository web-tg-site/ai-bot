import { UserWithTelegramId } from './user-with-telegram-id.type';

export type UsersWithoutFreeSubscriptionDays = 2 | 7;

export type UsersWithoutFreeSubscription = Record<
    UsersWithoutFreeSubscriptionDays,
    UserWithTelegramId[]
>;
