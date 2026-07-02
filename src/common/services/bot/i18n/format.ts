import { UserLanguage } from '@/generated/prisma/enums';

export function getLocaleTag(lang: UserLanguage): 'ru-RU' | 'en-US' {
    return lang === UserLanguage.EN ? 'en-US' : 'ru-RU';
}

export function formatDate(date: Date, lang: UserLanguage): string {
    return date.toLocaleDateString(getLocaleTag(lang), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

export function formatNumber(n: number, lang: UserLanguage): string {
    return n.toLocaleString(getLocaleTag(lang));
}
