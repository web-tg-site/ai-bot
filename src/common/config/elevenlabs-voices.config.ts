import { ConfigService } from '@nestjs/config';

export type ElevenLabsVoiceGender = 'Женский' | 'Мужской';

export type ElevenLabsVoiceOption = {
    id: string;
    labelRu: string;
    labelEn: string;
    gender?: ElevenLabsVoiceGender;
    previewUrl?: string | null;
};

export const ELEVENLABS_VOICE_CATALOG: readonly ElevenLabsVoiceOption[] = [
    {
        id: '21m00Tcm4TlvDq8ikWAM',
        labelRu: 'Рейчел',
        labelEn: 'Rachel',
        gender: 'Женский',
    },
    {
        id: 'pNInz6obpgDQGcFmaJgB',
        labelRu: 'Адам',
        labelEn: 'Adam',
        gender: 'Мужской',
    },
    {
        id: 'EXAVITQu4vr4xnSDxMaL',
        labelRu: 'Сара',
        labelEn: 'Sarah',
        gender: 'Женский',
    },
    {
        id: 'ErXwobaYiN019PkySvjV',
        labelRu: 'Антони',
        labelEn: 'Antoni',
        gender: 'Мужской',
    },
    {
        id: 'TxGEqnHWrfWFTfGW9XjX',
        labelRu: 'Джош',
        labelEn: 'Josh',
        gender: 'Мужской',
    },
    {
        id: 'MF3mGyEYCl7XYWbV9V6O',
        labelRu: 'Элли',
        labelEn: 'Elli',
        gender: 'Женский',
    },
    {
        id: 'VR6AewLTigWG4xSOukaG',
        labelRu: 'Арнольд',
        labelEn: 'Arnold',
        gender: 'Мужской',
    },
    {
        id: 'AZnzlk1XvdvUeBnXmlld',
        labelRu: 'Доми',
        labelEn: 'Domi',
        gender: 'Женский',
    },
    {
        id: 'yoZ06aMxZJJ28mfd3POQ',
        labelRu: 'Сэм',
        labelEn: 'Sam',
        gender: 'Мужской',
    },
    {
        id: 'XB0fDUnXU5powFXDhCwa',
        labelRu: 'Шарлотта',
        labelEn: 'Charlotte',
        gender: 'Женский',
    },
    {
        id: 'onwK4e9ZLuTAKqWW03F9',
        labelRu: 'Дэниел',
        labelEn: 'Daniel',
        gender: 'Мужской',
    },
    {
        id: 'pFZP5JQG7iQjIQuC4Bku',
        labelRu: 'Лили',
        labelEn: 'Lily',
        gender: 'Женский',
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
    elli: 'Элли',
    emily: 'Эмили',
    eric: 'Эрик',
    freya: 'Фрейя',
    george: 'Джордж',
    gigi: 'Джиджи',
    glasgow: 'Глазго',
    glinda: 'Глинда',
    grace: 'Грейс',
    harry: 'Гарри',
    james: 'Джеймс',
    jeremy: 'Джереми',
    jessica: 'Джессика',
    jessie: 'Джесси',
    joseph: 'Джозеф',
    josh: 'Джош',
    nicole: 'Николь',
    patrick: 'Патрик',
    paul: 'Пол',
    rachel: 'Рейчел',
    roxy: 'Рокси',
    sam: 'Сэм',
    sarah: 'Сара',
    serena: 'Серена',
    thomas: 'Томас',
    will: 'Уилл',
    laura: 'Лора',
    liam: 'Лиам',
    lily: 'Лили',
    matilda: 'Матильда',
    michael: 'Майкл',
};

export function mapElevenLabsGender(
    raw?: string | null,
): ElevenLabsVoiceGender | undefined {
    const value = raw?.trim().toLowerCase();
    if (!value) return undefined;
    if (
        value === 'female' ||
        value === 'woman' ||
        value === 'f' ||
        value.includes('female')
    ) {
        return 'Женский';
    }
    if (
        value === 'male' ||
        value === 'man' ||
        value === 'm' ||
        value.includes('male')
    ) {
        return 'Мужской';
    }
    return undefined;
}

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
