import { UserModelService } from '@/common/models/user';
import { BotSession } from '@/common/services/ai';
import { SubscribeType } from '@/generated/prisma/enums';
import { Context, Markup } from 'telegraf';
import { ExtraReplyMessage } from 'node_modules/telegraf/typings/telegram-types';
import { getI18nForUser, I18nBundle } from '../i18n';
import {
    generateHomeKeyboardNotRegistered,
    getHomeKeyboardRegistered,
} from '../keyboards';
import { resetAiSessionPreservingGpt } from './gpt-session';
import { replyMenuPhoto } from './menu-photo';

type BotContext = Context & { session: BotSession };

function getMiniAppUrl(): string | undefined {
    const url = process.env.MINI_APP_URL?.trim();
    return url || undefined;
}

async function sendHomeMenu(
    ctx: Context,
    filename: string,
    caption: string,
    i18n: I18nBundle,
    replyKeyboard: ExtraReplyMessage,
    miniAppUrl?: string,
) {
    // Reply-keyboard web_app opens without initData on Desktop/iOS.
    // An inline button is a real Mini App launch, same as the App menu button.
    if (!miniAppUrl) {
        await replyMenuPhoto(ctx, filename, caption, replyKeyboard);
        return;
    }

    await replyMenuPhoto(
        ctx,
        filename,
        caption,
        Markup.inlineKeyboard([
            [Markup.button.webApp(i18n.buttons.openApp, miniAppUrl)],
        ]),
    );
    await ctx.reply(i18n.home.sectionsPrompt, replyKeyboard);
}

export async function showHome(
    ctx: Context,
    userModelService: UserModelService,
) {
    if (!ctx.from) return;

    const botCtx = ctx as BotContext;
    if (botCtx.session) {
        botCtx.session.pendingTechSupport = undefined;
    }
    if (botCtx.session?.ai) {
        resetAiSessionPreservingGpt(botCtx.session);
    }

    const user = await userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    const i18n = getI18nForUser(user);
    const miniAppUrl = getMiniAppUrl();

    if (!user || user.subscribeType === SubscribeType.NOT_SUBSCRIBED) {
        const keyboard = generateHomeKeyboardNotRegistered(
            i18n,
            user ? !user.useFreeSub : true,
        );

        if (user) {
            await userModelService.updateUserLastActivityAt(
                ctx.from.id.toString(),
            );
        }

        await sendHomeMenu(
            ctx,
            'main.png',
            i18n.home.notRegistered,
            i18n,
            keyboard,
            miniAppUrl,
        );

        return;
    }

    await userModelService.updateUserLastActivityAt(ctx.from.id.toString());
    await sendHomeMenu(
        ctx,
        'main.png',
        i18n.home.registered,
        i18n,
        getHomeKeyboardRegistered(i18n),
        miniAppUrl,
    );
}
