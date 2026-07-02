import { Context, Telegraf } from 'telegraf';
import { I18nBundle } from './types';
import { ru } from './locales/ru';
import { en } from './locales/en';

const ALL_LOCALES: I18nBundle[] = [ru, en];

export function registerLocalizedHears(
    bot: Telegraf,
    getLabels: (i18n: I18nBundle) => string | string[],
    handler: (ctx: Context) => void | Promise<void>,
) {
    const registered = new Set<string>();

    for (const i18n of ALL_LOCALES) {
        const labels = getLabels(i18n);
        const arr = Array.isArray(labels) ? labels : [labels];

        for (const label of arr) {
            if (registered.has(label)) continue;
            registered.add(label);
            bot.hears(label, handler);
        }
    }
}
