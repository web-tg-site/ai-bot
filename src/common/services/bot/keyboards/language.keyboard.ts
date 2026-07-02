import { Markup } from 'telegraf';
import { UserLanguage } from '@/generated/prisma/enums';
import { I18nBundle } from '../i18n';

export const getLanguagePickerKeyboard = (i18n: I18nBundle) =>
    Markup.inlineKeyboard([
        [Markup.button.callback(i18n.languagePicker.ru, 'lang:RU')],
        [Markup.button.callback(i18n.languagePicker.en, 'lang:EN')],
    ]);

export const getSettingsLanguageKeyboard = (
    i18n: I18nBundle,
    current: UserLanguage,
) =>
    Markup.inlineKeyboard([
        [
            Markup.button.callback(
                `${current === UserLanguage.RU ? '✓ ' : ''}${i18n.languagePicker.ru}`,
                'settings:lang:RU',
            ),
        ],
        [
            Markup.button.callback(
                `${current === UserLanguage.EN ? '✓ ' : ''}${i18n.languagePicker.en}`,
                'settings:lang:EN',
            ),
        ],
    ]);
