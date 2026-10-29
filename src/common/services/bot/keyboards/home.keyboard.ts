import { Markup } from 'telegraf';
import { I18nBundle } from '../i18n';
import { getMainMiniAppLink } from '../utils/bot-username';

type KeyboardRow = any[];

function openAppButton(i18n: I18nBundle, miniAppUrl?: string) {
    const directLink = getMainMiniAppLink();
    if (directLink) {
        return Markup.button.url(i18n.buttons.openApp, directLink);
    }
    if (!miniAppUrl) return null;
    return Markup.button.webApp(i18n.buttons.openApp, miniAppUrl);
}

export const generateHomeKeyboardNotRegistered = (
    i18n: I18nBundle,
    useFreeSubscription: boolean,
    miniAppUrl?: string,
) => {
    const keyboard: KeyboardRow[] = [];
    const openApp = openAppButton(i18n, miniAppUrl);

    if (openApp) {
        keyboard.push([openApp]);
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

    const openApp = openAppButton(i18n, miniAppUrl);
    if (openApp) {
        rows.unshift([openApp]);
    }

    return Markup.keyboard(rows).resize();
};

export const getMySubKeyboard = (i18n: I18nBundle) =>
    Markup.keyboard([[i18n.buttons.subsTariffs], [i18n.buttons.back]]).resize();
