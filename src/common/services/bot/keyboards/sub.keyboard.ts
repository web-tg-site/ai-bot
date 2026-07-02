import { Markup } from 'telegraf';
import { I18nBundle } from '../i18n';
import { ru } from '../i18n/locales/ru';

export const getSubActivateKeyboard = (i18n: I18nBundle) =>
    Markup.keyboard([[i18n.buttons.start]]).resize();

export const subActivateKeyboard = getSubActivateKeyboard(ru);
