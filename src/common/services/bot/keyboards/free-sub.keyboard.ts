import { Markup } from 'telegraf';
import { I18nBundle } from '../i18n';

export const getFreeSubKeyboard = (i18n: I18nBundle) =>
    Markup.keyboard([
        [i18n.buttons.activateTrial, i18n.buttons.subsTariffs],
        [i18n.buttons.back],
    ]).resize();
