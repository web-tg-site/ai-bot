import { UserLanguage } from '@/generated/prisma/enums';
import { User } from '@/generated/prisma/client';
import { I18nBundle } from './types';
import { ru } from './locales/ru';
import { en } from './locales/en';
import { AiToolId } from '@/common/services/ai/types';

export * from './types';
export * from './format';
export * from './bot-actions';
export * from './register-localized-hears';
export { ru, en };

export function getI18n(language?: UserLanguage | null): I18nBundle {
    return language === UserLanguage.EN ? en : ru;
}

export function getI18nForUser(
    user?: Pick<User, 'language'> | null,
): I18nBundle {
    return getI18n(user?.language);
}

export function getToolLabel(
    toolId: AiToolId,
    language?: UserLanguage | null,
): string {
    return getI18n(language).tools.labels[toolId];
}

export function getToolInstruction(
    toolId: AiToolId,
    language?: UserLanguage | null,
): string {
    return getI18n(language).tools.instructions[toolId];
}

export function getAllToolLabels(toolId: AiToolId): string[] {
    return [ru.tools.labels[toolId], en.tools.labels[toolId]];
}

export function getToolIdByLabel(label: string): AiToolId | undefined {
    for (const toolId of Object.keys(ru.tools.labels) as AiToolId[]) {
        if (
            ru.tools.labels[toolId] === label ||
            en.tools.labels[toolId] === label
        ) {
            return toolId;
        }
    }
    return undefined;
}
