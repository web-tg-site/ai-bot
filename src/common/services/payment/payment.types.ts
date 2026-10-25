import type { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';

export type ProcessInvoicePaidResult =
    | { status: 'not_found' }
    | { status: 'already_paid' }
    | { status: 'pending' }
    | {
          status: 'activated';
          telegramId: string;
          subscribeType: SubscribeType;
          subscribePlan: SubscribePlan;
          subscriptionEndsAt: Date;
      };
