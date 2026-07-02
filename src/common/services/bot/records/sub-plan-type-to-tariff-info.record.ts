import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';

type TariffInfo = {
    credits: number;
    textRequests: number;
    images: number;
    video: number;
    audio: number;
};

export const SUB_TYPE_DESCRIPTION: Partial<Record<SubscribeType, string>> = {
    LITE: 'Подходит для знакомства с платформой и регулярного использования.',
    PRO: 'Для активной работы с нейросетями, контентом и бизнес-задачами.',
    BUSINESS:
        'Максимальные возможности платформы для бизнеса, команд и профессионального использования.',
};

export const SUB_PLAN_TYPE_TO_TARIFF_INFO: Record<
    SubscribePlan,
    Partial<Record<SubscribeType, TariffInfo>>
> = {
    MONTHLY: {
        LITE: {
            credits: 3713,
            textRequests: 3713,
            images: 185,
            video: 49,
            audio: 92,
        },
        PRO: {
            credits: 7443,
            textRequests: 7443,
            images: 372,
            video: 99,
            audio: 186,
        },
        BUSINESS: {
            credits: 14901,
            textRequests: 14901,
            images: 745,
            video: 198,
            audio: 372,
        },
    },
    THREE_MONTHS: {
        LITE: {
            credits: 9922,
            textRequests: 9922,
            images: 496,
            video: 132,
            audio: 248,
        },
        PRO: {
            credits: 19853,
            textRequests: 19853,
            images: 992,
            video: 264,
            audio: 496,
        },
        BUSINESS: {
            credits: 39723,
            textRequests: 39723,
            images: 1986,
            video: 529,
            audio: 993,
        },
    },
    SIX_MONTHS: {
        LITE: {
            credits: 17370,
            textRequests: 17370,
            images: 868,
            video: 231,
            audio: 434,
        },
        PRO: {
            credits: 34752,
            textRequests: 34752,
            images: 1737,
            video: 463,
            audio: 868,
        },
        BUSINESS: {
            credits: 68276,
            textRequests: 68276,
            images: 3413,
            video: 910,
            audio: 1706,
        },
    },
    YEARLY: {
        LITE: {
            credits: 29780,
            textRequests: 29780,
            images: 1489,
            video: 397,
            audio: 744,
        },
        PRO: {
            credits: 59584,
            textRequests: 59584,
            images: 2979,
            video: 794,
            audio: 1489,
        },
        BUSINESS: {
            credits: 117939,
            textRequests: 117939,
            images: 5896,
            video: 1572,
            audio: 2948,
        },
    },
};
