import { SubscribeType } from '@/generated/prisma/enums';
import { ru } from '../i18n/locales/ru';

export const SUB_TYPE_TO_TEXT: Record<SubscribeType, string> =
    ru.records.subTypeToText;
