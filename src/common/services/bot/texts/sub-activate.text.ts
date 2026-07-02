import { ru } from '../i18n/locales/ru';

export const generateSubActivateText = (tariffName: string, endsAt: string) =>
    ru.subActivate.text(tariffName, endsAt);
