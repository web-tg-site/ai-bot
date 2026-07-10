import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';
import { SUB_PLAN_TO_COST } from '../records';
import { formatRub } from '../utils';
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

const MENU_BUTTON_GETTERS: Array<(i18n: I18nBundle) => string | string[]> = [
    (i18n) => i18n.buttons.subsTariffs,
    (i18n) => i18n.buttons.mySub,
    (i18n) => i18n.buttons.support,
    (i18n) => i18n.buttons.settings,
    (i18n) => i18n.buttons.freeWeek,
    (i18n) => i18n.buttons.activateTrial,
    (i18n) => i18n.buttons.telegram,
    (i18n) => i18n.buttons.email,
    (i18n) => i18n.languagePicker.ru,
    (i18n) => i18n.languagePicker.en,
    (i18n) => Object.values(i18n.records.subPlanToPeriod),
];

let cachedMenuButtonLabels: Set<string> | undefined;
let cachedSubsFlowButtonLabels: Set<string> | undefined;

function getMenuButtonLabels(): Set<string> {
    if (!cachedMenuButtonLabels) {
        cachedMenuButtonLabels = new Set<string>();
        for (const i18n of ALL_LOCALES) {
            for (const getter of MENU_BUTTON_GETTERS) {
                const labels = getter(i18n);
                const arr = Array.isArray(labels) ? labels : [labels];
                for (const label of arr) {
                    cachedMenuButtonLabels.add(label);
                }
            }
        }
    }
    return cachedMenuButtonLabels;
}

function getSubsFlowButtonLabels(): Set<string> {
    if (!cachedSubsFlowButtonLabels) {
        cachedSubsFlowButtonLabels = new Set<string>();

        for (const plan of Object.keys(SubscribePlan) as SubscribePlan[]) {
            for (const type of Object.keys(SubscribeType) as SubscribeType[]) {
                if (
                    type === SubscribeType.FREE ||
                    type === SubscribeType.NOT_SUBSCRIBED
                ) {
                    continue;
                }

                const cost = SUB_PLAN_TO_COST[plan][type];
                cachedSubsFlowButtonLabels.add(
                    `${type} ${formatRub(cost.rub)} ₽ | ${cost.usdt} USDT`,
                );

                for (const i18n of ALL_LOCALES) {
                    cachedSubsFlowButtonLabels.add(
                        i18n.buttons.sbp(formatRub(cost.rub)),
                    );
                    cachedSubsFlowButtonLabels.add(
                        i18n.buttons.usdt(cost.usdt),
                    );
                }
            }
        }
    }
    return cachedSubsFlowButtonLabels;
}

export function isMenuButton(text: string | undefined): boolean {
    if (!text) return false;
    return (
        getMenuButtonLabels().has(text) || getSubsFlowButtonLabels().has(text)
    );
}
