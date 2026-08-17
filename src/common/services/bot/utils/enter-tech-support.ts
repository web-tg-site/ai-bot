import { UserModelService } from '@/common/models/user';
import { BotSession } from '@/common/services/ai';
import { Context } from 'telegraf';
import { getI18nForUser } from '../i18n';
import { getSupportInnerKeyboard } from '../keyboards';

type BotContext = Context & { session: BotSession };

function getSession(ctx: Context): BotSession {
    const botCtx = ctx as BotContext;
    if (!botCtx.session) {
        botCtx.session = {};
    }
    return botCtx.session;
}

export async function enterTechSupport(
    ctx: Context,
    userModelService: UserModelService,
) {
    if (!ctx.from) return;

    const session = getSession(ctx);
    session.pendingTechSupport = true;
    session.pendingRubPayment = undefined;

    const user = await userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    const i18n = getI18nForUser(user);

    await userModelService.updateUserLastActivityAt(ctx.from.id.toString());
    await ctx.reply(i18n.support.telegram, {
        ...getSupportInnerKeyboard(i18n),
    });
}
