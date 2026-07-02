import { I18nBundle } from './types';
import { ru } from './locales/ru';
import { en } from './locales/en';

const ALL_LOCALES: I18nBundle[] = [ru, en];

export function getAllButtonLabels(
    getter: (i18n: I18nBundle) => string,
): string[] {
    return ALL_LOCALES.map(getter);
}

export function getCategoryButtonLabels(): string[] {
    return ALL_LOCALES.flatMap((i18n) => [
        i18n.buttons.textCategory,
        i18n.buttons.imageCategory,
        i18n.buttons.videoCategory,
        i18n.buttons.audioCategory,
    ]);
}

export function isBackOrStartButton(text: string | undefined): boolean {
    if (!text) return false;
    return (
        getAllButtonLabels((i18n) => i18n.buttons.back).includes(text) ||
        getAllButtonLabels((i18n) => i18n.buttons.start).includes(text)
    );
}

export function isCategoryButton(text: string | undefined): boolean {
    if (!text) return false;
    return getCategoryButtonLabels().includes(text);
}
