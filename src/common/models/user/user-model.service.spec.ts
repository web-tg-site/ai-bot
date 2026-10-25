import type { Prisma, User } from '@/generated/prisma/client';
import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';
import { getSubscriptionDurationDays } from '@/common/config';
import { UserModelService } from './user-model.service';

const activeUser = (id = 'owner'): User =>
    ({
        id,
        isSubscriptionActive: true,
        subscriptionStartsAt: new Date('2090-01-01T00:00:00Z'),
        subscriptionEndsAt: new Date('2090-02-01T00:00:00Z'),
        subscribeType: SubscribeType.LITE,
        subscribePlan: SubscribePlan.MONTHLY,
    }) as User;
const service = new UserModelService({} as never);

function extend(date: Date, plan: SubscribePlan): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + getSubscriptionDurationDays(plan));
    return result;
}

describe('paid subscription user locking', () => {
    it('waits for a parameterized user row lock before reading or modifying subscription state', async () => {
        const userId = "owner' OR 1=1 --";
        const user = activeUser(userId);
        let release!: (rows: unknown[]) => void;
        const lock = new Promise<unknown[]>((resolve) => {
            release = resolve;
        });
        const tx = {
            $queryRaw: jest.fn(() => lock),
            user: {
                findUniqueOrThrow: jest.fn().mockResolvedValue(user),
                update: jest.fn().mockResolvedValue(user),
            },
        };
        const activation = service.activatePaidSubscriptionInTransaction(
            tx as unknown as Prisma.TransactionClient,
            userId,
            SubscribeType.PRO,
            SubscribePlan.MONTHLY,
        );
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        const [sql, parameter] = tx.$queryRaw.mock.calls[0] as unknown as [
            TemplateStringsArray,
            string,
        ];
        expect(sql.join('?')).toBe(
            'SELECT "id" FROM "users" WHERE "id" = ? FOR UPDATE',
        );
        expect(parameter).toBe(userId);
        expect(tx.user.findUniqueOrThrow).not.toHaveBeenCalled();
        expect(tx.user.update).not.toHaveBeenCalled();
        release([]);
        expect(await activation).toEqual({
            subscriptionEndsAt: extend(
                user.subscriptionEndsAt!,
                SubscribePlan.MONTHLY,
            ),
        });
        expect(tx.user.findUniqueOrThrow).toHaveBeenCalledWith({
            where: { id: userId },
        });
    });

    it('does not read or activate if the database lock fails', async () => {
        const tx = {
            $queryRaw: jest
                .fn()
                .mockRejectedValue(new Error('lock unavailable')),
            user: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
        };
        await expect(
            service.activatePaidSubscriptionInTransaction(
                tx as unknown as Prisma.TransactionClient,
                'owner',
                SubscribeType.PRO,
                SubscribePlan.MONTHLY,
            ),
        ).rejects.toThrow('lock unavailable');
        expect(tx.user.findUniqueOrThrow).not.toHaveBeenCalled();
        expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('preserves both extensions when different orders activate concurrently for the same user', async () => {
        // This fake models per-user row locks rather than serializing entire transactions.
        // PostgreSQL cross-process lock behavior still needs an integration smoke test.
        let stored = activeUser();
        let previousLock = Promise.resolve();
        async function transaction(plan: SubscribePlan) {
            let unlock: (() => void) | undefined;
            const tx = {
                $queryRaw: jest.fn(async () => {
                    const wait = previousLock;
                    previousLock = new Promise<void>((resolve) => {
                        unlock = resolve;
                    });
                    await wait;
                    return [];
                }),
                user: {
                    findUniqueOrThrow: jest.fn(() =>
                        Promise.resolve({ ...stored }),
                    ),
                    update: jest.fn(({ data }: { data: Partial<User> }) => {
                        stored = { ...stored, ...data };
                        return Promise.resolve({ ...stored });
                    }),
                },
            };
            try {
                return await service.activatePaidSubscriptionInTransaction(
                    tx as unknown as Prisma.TransactionClient,
                    stored.id,
                    SubscribeType.PRO,
                    plan,
                );
            } finally {
                unlock?.();
            }
        }
        const originalExpiry = stored.subscriptionEndsAt!;
        const [first, second] = await Promise.all([
            transaction(SubscribePlan.MONTHLY),
            transaction(SubscribePlan.THREE_MONTHS),
        ]);
        const firstExpiry = extend(originalExpiry, SubscribePlan.MONTHLY);
        const finalExpiry = extend(firstExpiry, SubscribePlan.THREE_MONTHS);
        expect(first.subscriptionEndsAt).toEqual(firstExpiry);
        expect(second.subscriptionEndsAt).toEqual(finalExpiry);
        expect(stored.subscriptionEndsAt).toEqual(finalExpiry);
    });
});
