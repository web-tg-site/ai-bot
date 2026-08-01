import { Markup } from 'telegraf';
import { I18nBundle } from '../i18n';

type KeyboardRow = any[];

export const generateHomeKeyboardNotRegistered = (
    i18n: I18nBundle,
    useFreeSubscription: boolean,
    miniAppUrl?: string,
) => {
    const keyboard: KeyboardRow[] = [];

    if (miniAppUrl) {
        keyboard.push([Markup.button.webApp(i18n.buttons.openApp, miniAppUrl)]);
    }

    if (useFreeSubscription) {
        keyboard.push([i18n.buttons.freeWeek]);
    }

    keyboard.push([i18n.buttons.subsTariffs]);
    keyboard.push([i18n.buttons.support]);

    return Markup.keyboard(keyboard).resize();
};

export const getHomeKeyboardRegistered = (
    i18n: I18nBundle,
    miniAppUrl?: string,
) => {
    const rows: KeyboardRow[] = [
        [i18n.buttons.textCategory, i18n.buttons.imageCategory],
        [i18n.buttons.videoCategory, i18n.buttons.audioCategory],
        [i18n.buttons.mySub],
        [i18n.buttons.settings, i18n.buttons.support],
    ];

    if (miniAppUrl) {
        rows.unshift([Markup.button.webApp(i18n.buttons.openApp, miniAppUrl)]);
    }

    return Markup.keyboard(rows).resize();
};

export const getMySubKeyboard = (i18n: I18nBundle) =>
    Markup.keyboard([[i18n.buttons.subsTariffs], [i18n.buttons.back]]).resize();
