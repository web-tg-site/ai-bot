import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { getI18nForUser } from '../i18n';
import { formatDate } from '../i18n/format';
import { BotHandlerDeps } from '../types/bot-handler-deps.type';

export const registerStarsPaymentHandler = (
    bot: Telegraf,
    deps: Pick<BotHandlerDeps, 'userModelService' | 'telegramStarsService'>,
) => {
    const { userModelService, telegramStarsService } = deps;

    bot.on('pre_checkout_query', async (ctx) => {
        const orderId = ctx.preCheckoutQuery.invoice_payload;
        const check = await telegramStarsService.assertPreCheckout(orderId);

        if (!check.ok) {
            await ctx.answerPreCheckoutQuery(false, check.errorMessage);
            return;
        }

        await ctx.answerPreCheckoutQuery(true);
    });

    bot.on(message('successful_payment'), async (ctx) => {
        const payment = ctx.message.successful_payment;
        const orderId = payment.invoice_payload;
        const chargeId = payment.telegram_payment_charge_id;

        const result = await telegramStarsService.processSuccessfulPayment(
            orderId,
            chargeId,
        );

        if (result.status !== 'activated') {
            return;
        }

        const user = await userModelService.getUserByTelegramId(
            result.telegramId,
        );
        const i18n = getI18nForUser(user);

        await ctx.reply(
            i18n.payment.success(
                i18n.records.subTypeToText[result.subscribeType],
                i18n.records.subPlanToPeriod[result.subscribePlan],
                formatDate(result.subscriptionEndsAt, i18n.lang),
            ),
            { parse_mode: 'HTML' },
        );
    });
};
