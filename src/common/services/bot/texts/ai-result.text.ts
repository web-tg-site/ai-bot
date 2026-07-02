import { ru } from '../i18n/locales/ru';

export const AI_VOICE_CLONE_STEP2_TEXT = ru.aiResult.voiceCloneStep2;
export const AI_VOICE_CLONE_NEED_SAMPLE_TEXT = ru.aiResult.voiceCloneNeedSample;
export const AI_VOICE_CLONE_NEED_TEXT_TEXT = ru.aiResult.voiceCloneNeedText;
export const AI_VOICE_CLONE_SAMPLE_UPDATED_TEXT =
    ru.aiResult.voiceCloneSampleUpdated;
export const AI_TOOL_SELECTED_TEXT = ru.aiResult.toolSelected;
export const AI_GENERATING_TEXT = ru.aiResult.generating;
export const AI_ASYNC_STARTED_TEXT = ru.aiResult.asyncStarted;
export const AI_MIDJOURNEY_FALLBACK_TEXT = ru.aiResult.midjourneyFallback;
export const AI_VIDEO_TO_AUDIO_PREPARING_TEXT =
    ru.aiResult.videoToAudioPreparing;
export const AI_INSUFFICIENT_TOKENS_TEXT = ru.aiResult.insufficientTokens;
export const AI_NO_SUBSCRIPTION_TEXT = ru.aiResult.noSubscription;
export const AI_ERROR_TEXT = ru.aiResult.error;
export const AI_JOB_COMPLETED_TEXT = '✅ Генерация завершена.';
export const AI_JOB_FAILED_TEXT = (message: string) =>
    `❌ Генерация не удалась:\n\n${message}`;
export const MY_SUBSCRIPTION_TEXT = (
    subscribeType: string,
    tokenLeft: number,
    subscriptionEndsAt?: Date | null,
) => ru.aiResult.mySubscription(subscribeType, tokenLeft, subscriptionEndsAt);
