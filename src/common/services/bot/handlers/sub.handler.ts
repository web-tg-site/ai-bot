import { Context, Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import {
    getChooseSubKeyboard,
    getSubsPlansKeyboard,
    getSubsTypesKeyboard,
} from '../keyboards/subs.keyboard';
import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';
import { SUB_PLAN_TO_COST } from '../records';
import { formatRub } from '../utils';
import { getI18nForUser } from '../i18n';
import { registerLocalizedHears } from '../i18n/register-localized-hears';
import { BotHandlerDeps } from '../types/bot-handler-deps.type';
import { BotSession } from '@/common/services/ai';
import { UserModelService } from '@/common/models/user';
import { AntilopayService } from '@/common/services/antilopay';

type BotContext = Context & { session: BotSession };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSession(ctx: Context): BotSession {
    const botCtx = ctx as BotContext;
    if (!botCtx.session) {
        botCtx.session = {};
    }
    return botCtx.session;
}

async function createRubInvoiceAndReply(params: {
    ctx: Context;
    userId: string;
    email: string;
    subscribeType: SubscribeType;
    subscribePlan: SubscribePlan;
    userModelService: UserModelService;
    antilopayService: AntilopayService;
}) {
    const {
        ctx,
        userId,
        email,
        subscribeType,
        subscribePlan,
        userModelService,
        antilopayService,
    } = params;

    const user = await userModelService.getUserByTelegramId(
        ctx.from!.id.toString(),
    );
    const i18n = getI18nForUser(user);
    const amountRub = SUB_PLAN_TO_COST[subscribePlan][subscribeType].rub;

    try {
        const invoice = await antilopayService.createCheckoutSession({
            userId,
            email,
            subscribeType,
            subscribePlan,
            amountRub,
        });

        await ctx.reply(
            i18n.payment.invoiceCreatedRub(
                formatRub(invoice.amountRub),
                i18n.records.subTypeToText[subscribeType],
                i18n.records.subPlanToPeriod[subscribePlan],
            ),
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    Markup.button.url(
                        i18n.payment.payButton,
                        invoice.checkoutUrl,
                    ),
                ]),
            },
        );
    } catch {
        await ctx.reply(i18n.payment.error, {
            parse_mode: 'HTML',
        });
    }
}

export const registerSubHandler = (
    bot: Telegraf,
    deps: Pick<
        BotHandlerDeps,
        'userModelService' | 'cryptoPayService' | 'antilopayService'
    >,
) => {
    const { userModelService, cryptoPayService, antilopayService } = deps;

    registerLocalizedHears(
        bot,
        (i18n) => i18n.buttons.subsTariffs,
        async (ctx) => {
            if (!ctx.from) return;

            const session = getSession(ctx);
            session.pendingRubPayment = undefined;

            const user = await userModelService.getUserByTelegramId(
                ctx.from.id.toString(),
            );
            const i18n = getI18nForUser(user);

            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
            await ctx.reply(i18n.subs.chooseSub, {
                ...getChooseSubKeyboard(i18n),
                parse_mode: 'HTML',
            });
        },
    );

    for (const plan of Object.keys(SubscribePlan) as SubscribePlan[]) {
        registerLocalizedHears(
            bot,
            (i18n) => i18n.records.subPlanToPeriod[plan],
            async (ctx) => {
                if (!ctx.from) return;

                const session = getSession(ctx);
                session.pendingRubPayment = undefined;

                const user = await userModelService.getUserByTelegramId(
                    ctx.from.id.toString(),
                );
                const i18n = getI18nForUser(user);

                await userModelService.updateUserLastActivityAt(
                    ctx.from.id.toString(),
                );
                await ctx.reply(i18n.subs.subTextForPeriod(plan), {
                    ...getSubsPlansKeyboard(i18n, plan),
                    parse_mode: 'HTML',
                });
            },
        );
    }

    for (const plan of Object.keys(SubscribePlan) as SubscribePlan[]) {
        for (const type of Object.keys(SubscribeType) as SubscribeType[]) {
            if (
                type === SubscribeType.FREE ||
                type === SubscribeType.NOT_SUBSCRIBED
            )
                continue;

            const label = `${type} ${formatRub(SUB_PLAN_TO_COST[plan][type].rub)} ₽ | ${SUB_PLAN_TO_COST[plan][type].usdt} USDT`;

            bot.hears(label, async (ctx) => {
                if (!ctx.from) return;

                const session = getSession(ctx);
                session.pendingRubPayment = undefined;

                const user = await userModelService.getUserByTelegramId(
                    ctx.from.id.toString(),
                );
                const i18n = getI18nForUser(user);

                await userModelService.updateUserLastActivityAt(
                    ctx.from.id.toString(),
                );
                await ctx.reply(i18n.subs.subTextForSubType(type, plan), {
                    ...getSubsTypesKeyboard(i18n, plan, type),
                    parse_mode: 'HTML',
                });
            });
        }
    }

    for (const plan of Object.keys(SubscribePlan) as SubscribePlan[]) {
        for (const type of Object.keys(SubscribeType) as SubscribeType[]) {
            if (
                type === SubscribeType.FREE ||
                type === SubscribeType.NOT_SUBSCRIBED
            ) {
                continue;
            }

            const amountUsd = SUB_PLAN_TO_COST[plan][type].usdt;

            registerLocalizedHears(
                bot,
                (i18n) => i18n.buttons.usdt(amountUsd),
                async (ctx) => {
                    if (!ctx.from) return;

                    const session = getSession(ctx);
                    session.pendingRubPayment = undefined;

                    const user = await userModelService.getUserByTelegramId(
                        ctx.from.id.toString(),
                    );

                    if (!user) return;

                    const i18n = getI18nForUser(user);

                    await userModelService.updateUserLastActivityAt(
                        ctx.from.id.toString(),
                    );

                    if (!cryptoPayService.isConfigured()) {
                        await ctx.reply(i18n.payment.notConfigured, {
                            parse_mode: 'HTML',
                        });
                        return;
                    }

                    try {
                        const invoice =
                            await cryptoPayService.createSubscriptionInvoice({
                                userId: user.id,
                                subscribeType: type,
                                subscribePlan: plan,
                                amountUsd,
                                periodLabel: i18n.records.subPlanToPeriod[plan],
                                tariffLabel: i18n.records.subTypeToText[type],
                            });

                        await ctx.reply(
                            i18n.payment.invoiceCreated(
                                invoice.amountUsd,
                                i18n.records.subTypeToText[type],
                                i18n.records.subPlanToPeriod[plan],
                            ),
                            {
                                parse_mode: 'HTML',
                                ...Markup.inlineKeyboard([
                                    Markup.button.url(
                                        i18n.payment.payButton,
                                        invoice.botInvoiceUrl,
                                    ),
                                ]),
                            },
                        );
                    } catch {
                        await ctx.reply(i18n.payment.error, {
                            parse_mode: 'HTML',
                        });
                    }
                },
            );

            registerLocalizedHears(
                bot,
                (i18n) =>
                    i18n.buttons.sbp(
                        formatRub(SUB_PLAN_TO_COST[plan][type].rub),
                    ),
                async (ctx) => {
                    if (!ctx.from) return;

                    const user = await userModelService.getUserByTelegramId(
                        ctx.from.id.toString(),
                    );

                    if (!user) return;

                    const i18n = getI18nForUser(user);
                    const session = getSession(ctx);

                    await userModelService.updateUserLastActivityAt(
                        ctx.from.id.toString(),
                    );

                    if (!antilopayService.isConfigured()) {
                        session.pendingRubPayment = undefined;
                        await ctx.reply(i18n.payment.rubNotConfigured, {
                            parse_mode: 'HTML',
                        });
                        return;
                    }

                    if (!user.email) {
                        session.pendingTechSupport = undefined;
                        session.pendingRubPayment = {
                            subscribeType: type,
                            subscribePlan: plan,
                        };
                        await ctx.reply(i18n.payment.askEmail, {
                            parse_mode: 'HTML',
                        });
                        return;
                    }

                    session.pendingRubPayment = undefined;
                    await createRubInvoiceAndReply({
                        ctx,
                        userId: user.id,
                        email: user.email,
                        subscribeType: type,
                        subscribePlan: plan,
                        userModelService,
                        antilopayService,
                    });
                },
            );
        }
    }

    bot.on('message', async (ctx, next) => {
        if (!ctx.from) return next();

        const session = getSession(ctx);
        const pending = session.pendingRubPayment;
        if (!pending) {
            return next();
        }

        const text =
            'text' in ctx.message && typeof ctx.message.text === 'string'
                ? ctx.message.text.trim()
                : undefined;

        if (text?.startsWith('/')) {
            return next();
        }

        const user = await userModelService.getUserByTelegramId(
            ctx.from.id.toString(),
        );

        if (!user) return next();

        const i18n = getI18nForUser(user);

        await userModelService.updateUserLastActivityAt(ctx.from.id.toString());

        if (!text || !EMAIL_RE.test(text)) {
            await ctx.reply(i18n.payment.emailInvalid, {
                parse_mode: 'HTML',
            });
            return;
        }

        const email = text.toLowerCase();

        await userModelService.updateUserByTelegramId(ctx.from.id.toString(), {
            email,
        });

        session.pendingRubPayment = undefined;

        if (!antilopayService.isConfigured()) {
            await ctx.reply(i18n.payment.rubNotConfigured, {
                parse_mode: 'HTML',
            });
            return;
        }

        await createRubInvoiceAndReply({
            ctx,
            userId: user.id,
            email,
            subscribeType: pending.subscribeType,
            subscribePlan: pending.subscribePlan,
            userModelService,
            antilopayService,
        });
    });
};
