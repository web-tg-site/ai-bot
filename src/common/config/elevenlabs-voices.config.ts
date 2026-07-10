import { ConfigService } from '@nestjs/config';

export type ElevenLabsVoiceOption = {
    id: string;
    labelRu: string;
    labelEn: string;
};

export const ELEVENLABS_VOICE_CATALOG: readonly ElevenLabsVoiceOption[] = [
    {
        id: '21m00Tcm4TlvDq8ikWAM',
        labelRu: 'Rachel',
        labelEn: 'Rachel',
    },
    {
        id: 'pNInz6obpgDQGcFmaJgB',
        labelRu: 'Adam',
        labelEn: 'Adam',
    },
    {
        id: 'EXAVITQu4vr4xnSDxMaL',
        labelRu: 'Sarah',
        labelEn: 'Sarah',
    },
    {
        id: 'ErXwobaYiN019PkySvjV',
        labelRu: 'Antoni',
        labelEn: 'Antoni',
    },
    {
        id: 'TxGEqnHWrfWFTfGW9XjX',
        labelRu: 'Josh',
        labelEn: 'Josh',
    },
    {
        id: 'MF3mGyEYCl7XYWbV9V6O',
        labelRu: 'Elli',
        labelEn: 'Elli',
    },
    {
        id: 'VR6AewLTigWG4xSOukaG',
        labelRu: 'Arnold',
        labelEn: 'Arnold',
    },
    {
        id: 'AZnzlk1XvdvUeBnXmlld',
        labelRu: 'Domi',
        labelEn: 'Domi',
    },
    {
        id: 'yoZ06aMxZJJ28mfd3POQ',
        labelRu: 'Sam',
        labelEn: 'Sam',
    },
    {
        id: 'XB0fDUnXU5powFXDhCwa',
        labelRu: 'Charlotte',
        labelEn: 'Charlotte',
    },
    {
        id: 'onwK4e9ZLuTAKqWW03F9',
        labelRu: 'Daniel',
        labelEn: 'Daniel',
    },
    {
        id: 'pFZP5JQG7iQjIQuC4Bku',
        labelRu: 'Lily',
        labelEn: 'Lily',
    },
] as const;

export function getDefaultElevenLabsVoiceId(
    configService?: ConfigService,
): string {
    const fromEnv = configService?.get<string>('ELEVENLABS_VOICE_ID');
    if (fromEnv && getElevenLabsVoiceOption(fromEnv)) {
        return fromEnv;
    }
    return ELEVENLABS_VOICE_CATALOG[0].id;
}

export function getElevenLabsVoiceOption(
    voiceId: string,
): ElevenLabsVoiceOption | undefined {
    return ELEVENLABS_VOICE_CATALOG.find((voice) => voice.id === voiceId);
}

export function getElevenLabsVoiceLabel(
    voiceId: string,
    localeTag: 'ru-RU' | 'en-US',
): string {
    const voice = getElevenLabsVoiceOption(voiceId);
    if (!voice) {
        return voiceId;
    }
    return localeTag === 'ru-RU' ? voice.labelRu : voice.labelEn;
}

export function getVoicePreviewSampleText(
    localeTag: 'ru-RU' | 'en-US',
): string {
    return localeTag === 'ru-RU'
        ? 'Привет! Это пример моего голоса. Так я буду озвучивать ваши тексты.'
        : 'Hello! This is a sample of my voice. I will read your texts like this.';
}
