import { Markup } from 'telegraf';
import { I18nBundle } from '../i18n';

export const generateAiKeyboard = (i18n: I18nBundle, ais: string[]) => {
    const keyboard: string[][] = [];

    for (let i = 0; i < ais.length; i += 2) {
        keyboard.push(ais.slice(i, i + 2));
    }

    keyboard.push([i18n.buttons.back]);

    return Markup.keyboard(keyboard).resize();
};
