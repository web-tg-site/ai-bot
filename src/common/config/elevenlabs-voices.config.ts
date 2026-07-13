import { ConfigService } from '@nestjs/config';

export type ElevenLabsVoiceOption = {
    id: string;
    labelRu: string;
    labelEn: string;
};

export const ELEVENLABS_VOICE_CATALOG: readonly ElevenLabsVoiceOption[] = [
    {
        id: '21m00Tcm4TlvDq8ikWAM',
        labelRu: 'Рейчел',
        labelEn: 'Rachel',
    },
    {
        id: 'pNInz6obpgDQGcFmaJgB',
        labelRu: 'Адам',
        labelEn: 'Adam',
    },
    {
        id: 'EXAVITQu4vr4xnSDxMaL',
        labelRu: 'Сара',
        labelEn: 'Sarah',
    },
    {
        id: 'ErXwobaYiN019PkySvjV',
        labelRu: 'Антони',
        labelEn: 'Antoni',
    },
    {
        id: 'TxGEqnHWrfWFTfGW9XjX',
        labelRu: 'Джош',
        labelEn: 'Josh',
    },
    {
        id: 'MF3mGyEYCl7XYWbV9V6O',
        labelRu: 'Элли',
        labelEn: 'Elli',
    },
    {
        id: 'VR6AewLTigWG4xSOukaG',
        labelRu: 'Арнольд',
        labelEn: 'Arnold',
    },
    {
        id: 'AZnzlk1XvdvUeBnXmlld',
        labelRu: 'Доми',
        labelEn: 'Domi',
    },
    {
        id: 'yoZ06aMxZJJ28mfd3POQ',
        labelRu: 'Сэм',
        labelEn: 'Sam',
    },
    {
        id: 'XB0fDUnXU5powFXDhCwa',
        labelRu: 'Шарлотта',
        labelEn: 'Charlotte',
    },
    {
        id: 'onwK4e9ZLuTAKqWW03F9',
        labelRu: 'Дэниел',
        labelEn: 'Daniel',
    },
    {
        id: 'pFZP5JQG7iQjIQuC4Bku',
        labelRu: 'Лили',
        labelEn: 'Lily',
    },
] as const;

/** Russian display names keyed by short English voice name from ElevenLabs API */
const ELEVENLABS_VOICE_LABELS_RU: Record<string, string> = {
    adam: 'Адам',
    alice: 'Алиса',
    antoni: 'Антони',
    arnold: 'Арнольд',
    bella: 'Белла',
    bill: 'Билл',
    brian: 'Брайан',
    callum: 'Каллум',
    charlie: 'Чарли',
    charlotte: 'Шарлотта',
    chris: 'Крис',
    daniel: 'Дэниел',
    domi: 'Доми',
    ell: 'Элли',
    eric: 'Эрик',
    george: 'Джордж',
    harry: 'Гарри',
    jessica: 'Джессика',
    josh: 'Джош',
    laura: 'Лора',
    liam: 'Лиам',
    lily: 'Лили',
    rachel: 'Рейчел',
    sam: 'Сэм',
    sarah: 'Сара',
};

function parseElevenLabsApiVoiceName(apiName: string): {
    shortName: string;
    labelEn: string;
} {
    const labelEn = apiName.trim();
    const shortName = labelEn.split(' - ')[0]?.trim() || labelEn;
    return { shortName, labelEn };
}

export function resolveElevenLabsVoiceLabels(
    voiceId: string,
    apiName: string,
): { labelRu: string; labelEn: string } {
    const catalogVoice = getElevenLabsVoiceOption(voiceId);
    const { shortName, labelEn } = parseElevenLabsApiVoiceName(apiName);
    const ruFromMap =
        ELEVENLABS_VOICE_LABELS_RU[shortName.toLowerCase()] ??
        (catalogVoice ? catalogVoice.labelRu : undefined);

    return {
        labelRu: ruFromMap ?? shortName,
        labelEn,
    };
}

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

export function getElevenLabsVoiceLabelFromApiName(
    apiName: string,
    localeTag: 'ru-RU' | 'en-US',
    voiceId?: string,
): string {
    const labels = resolveElevenLabsVoiceLabels(voiceId ?? '', apiName);
    return localeTag === 'ru-RU' ? labels.labelRu : labels.labelEn;
}

export function getVoicePreviewSampleText(
    localeTag: 'ru-RU' | 'en-US',
): string {
    return localeTag === 'ru-RU'
        ? 'Привет! Это пример моего голоса. Так я буду озвучивать ваши тексты.'
        : 'Hello! This is a sample of my voice. I will read your texts like this.';
}
