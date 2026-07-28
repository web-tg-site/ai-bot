import { BotService } from '@/common/services/bot';
import { UserModelService } from '@/common/models/user';
import { ProcessInvoicePaidResult } from '@/common/services/crypto-pay';
import { getI18nForUser } from '@/common/services/bot/i18n';
import { formatDate } from '@/common/services/bot/i18n/format';

export async function notifyPaidSubscriptionActivations(
    botService: BotService,
    userModelService: UserModelService,
    results: ProcessInvoicePaidResult[],
): Promise<void> {
    for (const result of results) {
        if (result.status !== 'activated') {
            continue;
        }

        const user = await userModelService.getUserByTelegramId(
            result.telegramId,
        );
        const i18n = getI18nForUser(user);

        await botService.sendMessage(
            result.telegramId,
            i18n.payment.success(
                i18n.records.subTypeToText[result.subscribeType],
                i18n.records.subPlanToPeriod[result.subscribePlan],
                formatDate(result.subscriptionEndsAt, i18n.lang),
            ),
            { parse_mode: 'HTML' },
        );
    }
}
