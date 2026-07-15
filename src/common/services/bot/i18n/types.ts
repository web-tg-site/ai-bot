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
        privacyPolicy: string;
        userAgreement: string;
        refundPolicy: string;
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
        generationTakingLonger: string;
        videoToAudioPreparing: string;
        insufficientTokens: string;
        noSubscription: string;
        error: (message: string) => string;
        errorWithCode: (code: number, message: string) => string;
        tokensRefunded: (amount: number) => string;
        errorByCode: Record<number, string>;
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
        privacyPolicy: string;
        userAgreement: string;
        refundPolicy: string;
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
        refDeleteButton: string;
        refDeleted: string;
        refNotFound: string;
        refLimitReached: (max: number) => string;
        needPhotoOnRefStep: string;
        needPrompt: string;
        aspectRatioButton: (ratio: string) => string;
        resolutionButton: (resolution: string) => string;
        formatToolbarButton: (ratio: string) => string;
        changeFormatButton: string;
        changeResolutionButton: string;
        changeQualityButton: string;
        resolutionToolbarButton: (resolution: string) => string;
        selectAspectRatioTitle: string;
        selectResolutionTitle: string;
        selectQualityTitle: string;
        aspectRatioPickerOption: (ratio: string) => string;
        aspectRatioPickerSelected: (ratio: string) => string;
        resolutionPickerOption: (resolution: string, tokens: number) => string;
        resolutionPickerSelected: (
            resolution: string,
            tokens: number,
        ) => string;
        qualityPickerOption: (label: string, tokens: number) => string;
        qualityPickerSelected: (label: string, tokens: number) => string;
        aspectRatioChanged: (ratio: string) => string;
        resolutionChanged: (resolution: string, tokens: number) => string;
        qualityChanged: (label: string, tokens: number) => string;
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
        formatLine: (
            format: string,
            resolution?: string,
            quality?: string,
        ) => string;
        sendAsFileButton: (asFile: boolean) => string;
        sendAsFileChanged: (asFile: boolean) => string;
        deliveryLine: (asFile: boolean) => string;
    };
    videoTool: {
        promptHint: string;
        refAdded: (count: number, max: number) => string;
        refDeleteButton: string;
        refDeleted: string;
        refNotFound: string;
        refLimitReached: (max: number) => string;
        needPhotoOnRefStep: string;
        needPrompt: string;
        aspectRatioButton: (ratio: string) => string;
        resolutionButton: (resolution: string) => string;
        formatToolbarButton: (ratio: string) => string;
        changeFormatButton: string;
        changeResolutionButton: string;
        changeQualityButton: string;
        changeDurationButton: string;
        changeStyleButton: string;
        resolutionToolbarButton: (resolution: string) => string;
        selectAspectRatioTitle: string;
        selectResolutionTitle: string;
        selectQualityTitle: string;
        selectDurationTitle: string;
        selectStyleTitle: string;
        aspectRatioPickerOption: (ratio: string) => string;
        aspectRatioPickerSelected: (ratio: string) => string;
        resolutionPickerOption: (resolution: string, tokens: number) => string;
        resolutionPickerSelected: (
            resolution: string,
            tokens: number,
        ) => string;
        qualityPickerOption: (label: string, tokens: number) => string;
        qualityPickerSelected: (label: string, tokens: number) => string;
        aspectRatioChanged: (ratio: string) => string;
        resolutionChanged: (resolution: string, tokens: number) => string;
        qualityChanged: (label: string, tokens: number) => string;
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
        formatLine: (
            format: string,
            resolution?: string,
            quality?: string,
        ) => string;
        summaryLine: (options: {
            format?: string;
            resolution?: string;
            qualityLabel?: string;
            durationSeconds?: number;
            styleLabel?: string;
            credits?: number;
        }) => string;
        durationLabel: (seconds: number) => string;
        sendAsFileButton: (asFile: boolean) => string;
        sendAsFileChanged: (asFile: boolean) => string;
        deliveryLine: (asFile: boolean) => string;
    };
    voiceTool: {
        selectVoiceButton: string;
        confirmVoiceButton: string;
        rejectVoiceButton: string;
        backToVoiceList: string;
        backToEditor: string;
        settingsMenuTitle: string;
        previewGenerating: string;
        previewCaption: (voiceName: string) => string;
        voiceConfirmed: (voiceName: string) => string;
        voiceRejected: string;
        voiceLine: (voiceName: string) => string;
        voicePickerOption: (voiceName: string) => string;
        voicePickerSelected: (voiceName: string) => string;
        keyboardUpdated: (toolName: string) => string;
        sendAsFileButton: (asFile: boolean) => string;
        sendAsFileChanged: (asFile: boolean) => string;
        deliveryLine: (asFile: boolean) => string;
    };
};
