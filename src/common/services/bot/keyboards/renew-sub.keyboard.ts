import { Markup } from 'telegraf';

export const renewSubKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Ознакомиться с тарифами', 'renew_sub_to_premium')],
]);
