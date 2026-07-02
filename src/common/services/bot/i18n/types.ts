import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';
import { UserLanguage } from '@/generated/prisma/enums';
import { AiToolId } from '@/common/services/ai/types';

export { UserLanguage };

export type I18nBundle = {
    lang: UserLanguage;
    localeTag: 'ru-RU' | 'en-US';
    buttons: {
        back: string;
        start: string;
        textCategory: string;
        imageCategory: string;
        videoCategory: string;
        audioCategory: string;
        mySub: string;
        support: string;
        settings: string;
        subsTariffs: string;
        freeWeek: string;
        activateTrial: string;
        telegram: string;
        email: string;
        sbp: (amount: string) => string;
        usdt: (amount: number) => string;
    };
    settings: {
        title: string;
        languageChanged: string;
    };
    languagePicker: {
        prompt: string;
        ru: string;
        en: string;
    };
    home: {
        notRegistered: string;
        registered: string;
    };
    ai: {
        textBots: string;
        imageBots: string;
        videoBots: string;
        audioBots: string;
    };
    aiResult: {
        voiceCloneStep2: string;
        voiceCloneNeedSample: string;
        voiceCloneNeedText: string;
        voiceCloneSampleUpdated: string;
        toolSelected: (toolName: string, instruction: string) => string;
        generating: string;
        asyncStarted: string;
        midjourneyFallback: string;
        videoToAudioPreparing: string;
        insufficientTokens: string;
        noSubscription: string;
        error: (message: string) => string;
        sendTextOrFile: string;
        mySubscription: (
            subscribeType: string,
            tokenLeft: number,
            subscriptionEndsAt?: Date | null,
        ) => string;
    };
    subs: {
        chooseSub: string;
        subTextForPeriod: (plan: SubscribePlan) => string;
        subTextForSubType: (type: SubscribeType, plan: SubscribePlan) => string;
    };
    freeSub: {
        text: string;
        activateText: (endsAt: string) => string;
    };
    subActivate: {
        text: (tariffName: string, endsAt: string) => string;
    };
    support: {
        text: string;
        telegram: string;
        email: string;
    };
    records: {
        subPlanToPeriod: Record<SubscribePlan, string>;
        subTypeToText: Record<SubscribeType, string>;
        subTypeDescription: Partial<Record<SubscribeType, string>>;
        tariffIncludes: {
            textRequests: (n: string) => string;
            images: (n: string) => string;
            video: (n: string) => string;
            audio: (n: string) => string;
        };
    };
    tools: {
        labels: Record<AiToolId, string>;
        instructions: Record<AiToolId, string>;
    };
};
