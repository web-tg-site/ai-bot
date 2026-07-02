import { UserModelService } from '@/common/models/user';
import { SubscribeType } from '@/generated/prisma/enums';
import { Context } from 'telegraf';
import { getI18nForUser } from '../i18n';
import {
    generateHomeKeyboardNotRegistered,
    getHomeKeyboardRegistered,
} from '../keyboards';

export async function showHome(
    ctx: Context,
    userModelService: UserModelService,
) {
    if (!ctx.from) return;

    const user = await userModelService.getUserByTelegramId(
        ctx.from.id.toString(),
    );
    const i18n = getI18nForUser(user);

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

        await ctx.reply(i18n.home.notRegistered, {
            ...keyboard,
            parse_mode: 'HTML',
        });

        return;
    }

    await userModelService.updateUserLastActivityAt(ctx.from.id.toString());
    await ctx.reply(i18n.home.registered, {
        ...getHomeKeyboardRegistered(i18n),
        parse_mode: 'HTML',
    });
}
