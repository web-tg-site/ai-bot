import { SubscribePlan, SubscribeType } from '@/generated/prisma/enums';
import { UserLanguage } from '@/generated/prisma/enums';
import { AiToolId } from '@/common/services/ai/types';
import { GptReplyMode } from '@/common/services/ai/types/ai-generation-result.type';

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
    payment: {
        invoiceCreated: (
            amountUsd: number,
            tariffName: string,
            periodName: string,
        ) => string;
        payButton: string;
        success: (
            tariffName: string,
            periodName: string,
            endsAt: string,
        ) => string;
        error: string;
        sbpComingSoon: string;
        notConfigured: string;
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
    gptChat: {
        newChat: string;
        myChats: string;
        clearHistory: string;
        webSearchOn: string;
        webSearchOff: string;
        replyModeLabel: (mode: GptReplyMode) => string;
        newChatCreated: string;
        chatListTitle: string;
        noChats: string;
        chatNotFound: string;
        chatOpened: (title: string, lastMessage?: string) => string;
        clearConfirm: string;
        confirmClear: string;
        cancelClear: string;
        noActiveChat: string;
        historyCleared: string;
        clearCancelled: string;
        webSearchEnabled: string;
        webSearchDisabled: string;
        replyModeChanged: (mode: GptReplyMode) => string;
        controlsHint: string;
    };
    imageTool: {
        promptHint: string;
        refAdded: (count: number, max: number) => string;
        refLimitReached: (max: number) => string;
        needPhotoOnRefStep: string;
        needPrompt: string;
        aspectRatioButton: (ratio: string) => string;
        resolutionButton: (resolution: string) => string;
        formatToolbarButton: (ratio: string) => string;
        changeFormatButton: string;
        changeResolutionButton: string;
        resolutionToolbarButton: (resolution: string) => string;
        selectAspectRatioTitle: string;
        selectResolutionTitle: string;
        aspectRatioPickerOption: (ratio: string) => string;
        aspectRatioPickerSelected: (ratio: string) => string;
        resolutionPickerOption: (resolution: string) => string;
        resolutionPickerSelected: (resolution: string) => string;
        aspectRatioChanged: (ratio: string) => string;
        resolutionChanged: (resolution: string) => string;
        topazScaleButton: (
            scale: number,
            tokens: number,
            selected: boolean,
        ) => string;
        topazScaleChanged: (scale: number, tokens: number) => string;
        continueToPrompt: string;
        skipRefs: string;
        settingsButton: string;
        backToSettings: string;
        backToEditor: string;
        settingsMenuTitle: string;
        keyboardUpdated: (toolName: string) => string;
        formatLine: (format: string, resolution?: string) => string;
    };
    videoTool: {
        promptHint: string;
        refAdded: (count: number, max: number) => string;
        refLimitReached: (max: number) => string;
        needPhotoOnRefStep: string;
        needPrompt: string;
        aspectRatioButton: (ratio: string) => string;
        resolutionButton: (resolution: string) => string;
        formatToolbarButton: (ratio: string) => string;
        changeFormatButton: string;
        changeResolutionButton: string;
        changeDurationButton: string;
        changeStyleButton: string;
        resolutionToolbarButton: (resolution: string) => string;
        selectAspectRatioTitle: string;
        selectResolutionTitle: string;
        selectDurationTitle: string;
        selectStyleTitle: string;
        aspectRatioPickerOption: (ratio: string) => string;
        aspectRatioPickerSelected: (ratio: string) => string;
        resolutionPickerOption: (resolution: string) => string;
        resolutionPickerSelected: (resolution: string) => string;
        aspectRatioChanged: (ratio: string) => string;
        resolutionChanged: (resolution: string) => string;
        durationToolbarButton: (seconds: number, credits: number) => string;
        durationPickerOption: (seconds: number, credits: number) => string;
        durationPickerSelected: (seconds: number, credits: number) => string;
        durationChanged: (seconds: number, credits: number) => string;
        styleToolbarButton: (styleLabel: string) => string;
        stylePickerOption: (styleLabel: string) => string;
        stylePickerSelected: (styleLabel: string) => string;
        styleChanged: (styleLabel: string) => string;
        continueToPrompt: string;
        skipRefs: string;
        settingsButton: string;
        backToSettings: string;
        backToEditor: string;
        settingsMenuTitle: string;
        keyboardUpdated: (toolName: string) => string;
        formatLine: (format: string, resolution?: string) => string;
        summaryLine: (options: {
            format?: string;
            resolution?: string;
            durationSeconds?: number;
            styleLabel?: string;
            credits?: number;
        }) => string;
        durationLabel: (seconds: number) => string;
    };
};
