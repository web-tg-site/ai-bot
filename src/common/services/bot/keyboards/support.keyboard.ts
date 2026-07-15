import { Markup } from 'telegraf';
import { I18nBundle } from '../i18n';

export const getSupportKeyboard = (i18n: I18nBundle) =>
    Markup.keyboard([
        [i18n.buttons.telegram, i18n.buttons.email],
        [i18n.buttons.privacyPolicy],
        [i18n.buttons.userAgreement],
        [i18n.buttons.refundPolicy],
        [i18n.buttons.back],
    ]).resize();

export const getSupportInnerKeyboard = (i18n: I18nBundle) =>
    Markup.keyboard([[i18n.buttons.back]]).resize();
