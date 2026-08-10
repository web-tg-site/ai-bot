import { ConfigService } from '@nestjs/config';

export type ElevenLabsVoiceGender = 'Женский' | 'Мужской';

export type ElevenLabsUseCaseId =
    | 'social_media'
    | 'narrative_story'
    | 'conversational'
    | 'entertainment_tv'
    | 'characters_animation'
    | 'informative_educational'
    | 'advertisement';

export type ElevenLabsVoiceOption = {
    id: string;
    labelRu: string;
    labelEn: string;
    gender?: ElevenLabsVoiceGender;
    /** Рекомендуемый сценарий использования (как use_case в ElevenLabs). */
    useCase?: ElevenLabsUseCaseId;
    previewUrl?: string | null;
};

/**
 * Каталог голосов: premade + professional из аккаунта.
 * Live API (`listAccessibleVoices`) подставляет preview/gender,
 * а русские подписи с описанием берём отсюда.
 */
export const ELEVENLABS_VOICE_CATALOG: readonly ElevenLabsVoiceOption[] = [
    // Premade
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
        useCase: 'social_media',
    },
    {
        id: 'EXAVITQu4vr4xnSDxMaL',
        labelRu: 'Сара',
        labelEn: 'Sarah',
        gender: 'Женский',
        useCase: 'entertainment_tv',
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
        useCase: 'informative_educational',
    },
    {
        id: 'pFZP5JQG7iQjIQuC4Bku',
        labelRu: 'Лили',
        labelEn: 'Lily',
        gender: 'Женский',
        useCase: 'informative_educational',
    },

    // Professional (аккаунт Creator)
    {
        id: '9fK40vxwowu0fJFOPACM',
        labelRu: 'Агасси Ру — дружелюбный и живой',
        labelEn: 'Agassi Roux - Friendly and Engaging',
        gender: 'Мужской',
        useCase: 'social_media',
    },
    {
        id: 'dVRDrbP5ULGXB94se4KZ',
        labelRu: 'Алина — молодая, динамичная и чёткая',
        labelEn: 'Alina - Youthful, Dynamic and Clear',
        gender: 'Женский',
        useCase: 'social_media',
    },
    {
        id: '8G41WXYiATlXGtqa8mbx',
        labelRu: 'Андрей Дудин — для программирования и туториалов',
        labelEn: 'Andrew Dudin - Programmer',
        gender: 'Мужской',
        useCase: 'social_media',
    },
    {
        id: 'deqzqEZ3ngCdcOl0jF1F',
        labelRu: 'Анна Зуб — тёплый мультиязычный рассказчик',
        labelEn: 'Anna Zub - Warm Multilingual Narrator',
        gender: 'Женский',
        useCase: 'narrative_story',
    },
    {
        id: 'TpZlRcB7rTBboAYWa2DC',
        labelRu: 'Антон — глубокий и тёплый',
        labelEn: 'Anton - Deep & Warm',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'kuR1PV7xDOsP38QMSEvD',
        labelRu: 'Аркад — спокойный и глубокий',
        labelEn: 'Arcad',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 's0phbFBBp708ZeIy8oGx',
        labelRu: 'Аркадейс — тёплый, лёгкий и естественный',
        labelEn: 'Arcadays - Warm, Light and Natural',
        gender: 'Мужской',
        useCase: 'conversational',
    },
    {
        id: 'iYMRkaJMA0qIuY9moBHL',
        labelRu: 'Артур — глубокий, элегантный и чёткий',
        labelEn: 'Arthur - Deep, Elegant and Clear',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'vpUqfpCIn34tjFW4KHjt',
        labelRu: 'Артур Денофайн — яркий и радостный',
        labelEn: 'Artur Denophine - Vibrant and Joyful',
        gender: 'Мужской',
        useCase: 'social_media',
    },
    {
        id: 'q5RNAd4899271dg9W2K8',
        labelRu: 'Ден — мягкий и плавный',
        labelEn: 'Den - Gentle and Smooth',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: '1EVds7FNGSXoKeOiMXuf',
        labelRu: 'Денис — уверенный и властный',
        labelEn: 'Denis - Confident and Commanding',
        gender: 'Мужской',
        useCase: 'conversational',
    },
    {
        id: '0BcDz9UPwL3MpsnTeUlO',
        labelRu: 'Денис — приятный, живой и дружелюбный',
        labelEn: 'Denis - Pleasant, Engaging and Friendly',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: '6A9D8WSMm4rFsg2DWFeE',
        labelRu: 'Егор Гаджиев — чёткий и властный',
        labelEn: 'Egor Gadzhiyev - Clear and Commanding',
        gender: 'Мужской',
        useCase: 'characters_animation',
    },
    {
        id: 'GN4wbsbejSnGSa1AzjH5',
        labelRu: 'Екатерина — мягкая, бархатная и нежная',
        labelEn: 'Ekaterina - Soft, Silky and Tender',
        gender: 'Женский',
        useCase: 'narrative_story',
    },
    {
        id: 'dJLURfd0OIfcFXn6H1Hq',
        labelRu: 'Елена Туманова — мелодичная и живая',
        labelEn: 'Elena Tymanova',
        gender: 'Женский',
        useCase: 'social_media',
    },
    {
        id: 'dWNEQ4rqRY6thcusuDyq',
        labelRu: 'Фуад — чёткий, глубокий и насыщенный',
        labelEn: 'Fuad - Clear, Deep and Rich',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'MYw0upsxdtxs1n97djly',
        labelRu: 'Георгий — чёткий, живой и уверенный',
        labelEn: 'Georgy - Clear, Engaging and Confident',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'hRJPpkSVdR2btkZBUz26',
        labelRu: 'Игорь — дружелюбный',
        labelEn: 'Igor',
        gender: 'Мужской',
        useCase: 'social_media',
    },
    {
        id: '1qd9R09Ljlx9V1Ok0t5S',
        labelRu: 'Иван — медитативный, спокойный и расслабляющий',
        labelEn: 'Ivan - Meditative, Calm and Relaxing',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'HO0xRRVNKM5KFlpsrNit',
        labelRu: 'Кучка — весёлый и располагающий',
        labelEn: 'Kuchka - Cheerful and Inviting',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'EDpEYNf6XIeKYRzYcx4I',
        labelRu: 'Мария — размеренная, спокойная и живая',
        labelEn: 'Mariia - Measured, Calm and Engaging',
        gender: 'Женский',
        useCase: 'narrative_story',
    },
    {
        id: 'ZHIn0jcgR6VIvVAXkwWV',
        labelRu: 'Маркос — энергичный и живой',
        labelEn: 'Markos - Energetic and Engaging',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'huXlXYhtMIZkTYxM93t6',
        labelRu: 'Мейсон — уверенный, спокойный и живой',
        labelEn: 'Mason - Confident, Calm and Engaging',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'ouyTiWqmHA5WI5bbX7zj',
        labelRu: 'Михаил — уверенный и эмоциональный',
        labelEn: 'Mikhail - Confident and Emotional',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'pM78bgjPVk0JXtaEnFoj',
        labelRu: 'Нестер Суровый — хрипловатый и благородный',
        labelEn: 'Nester Surovy - Gravely yet Refined',
        gender: 'Мужской',
        useCase: 'characters_animation',
    },
    {
        id: '3EuKHIEZbSzrHGNmdYsx',
        labelRu: 'Николай — уверенный, чёткий и живой',
        labelEn: 'Nikolay - Confident, Clear and Engaging',
        gender: 'Мужской',
        useCase: 'social_media',
    },
    {
        id: 'MWyJiWDobXN8FX3CJTdE',
        labelRu: 'Олег — спокойный, естественный и чёткий',
        labelEn: 'Oleg - Calm, Natural and Clear',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'jF2jkOwefhvnRzZHn0sl',
        labelRu: 'Ольга — элегантный русский голос',
        labelEn: 'Olga - Elegant Russian',
        gender: 'Женский',
        useCase: 'narrative_story',
    },
    {
        id: 'd60rsXo2p0OwikDR5bS7',
        labelRu: 'Ольга Орлова — чёткая и живая',
        labelEn: 'Olga Orlova - Clear and Engaging',
        gender: 'Женский',
        useCase: 'informative_educational',
    },
    {
        id: 'O9f5Hqzk8FPymrA0cAZq',
        labelRu: 'Пол — для телефонных звонков',
        labelEn: 'Paul - Phone call',
        gender: 'Мужской',
        useCase: 'social_media',
    },
    {
        id: 'XuEV9VY3VUASYgJVNBh0',
        labelRu: 'Сергей — насыщенный, живой и захватывающий',
        labelEn: 'Sergey - Rich, Engaging and Captivating',
        gender: 'Мужской',
        useCase: 'narrative_story',
    },
    {
        id: 'RUB3PhT3UqHowKru61Ns',
        labelRu: 'Влад Кип — живой и харизматичный',
        labelEn: 'Vlad Keep - Engaging and Charismatic',
        gender: 'Мужской',
        useCase: 'conversational',
    },
    {
        id: '2yWzeFFP9bP0WcgRi1jx',
        labelRu: 'Владимир — низкий и глубокий',
        labelEn: 'Vladimir - Low & Deep',
        gender: 'Мужской',
        useCase: 'conversational',
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


const ELEVENLABS_USE_CASE_LABELS: Record<
    ElevenLabsUseCaseId,
    { labelRu: string; labelEn: string }
> = {
    social_media: { labelRu: 'Соцсети', labelEn: 'Social Media' },
    narrative_story: { labelRu: 'Повествование', labelEn: 'Narration' },
    conversational: { labelRu: 'Разговорный', labelEn: 'Conversational' },
    entertainment_tv: { labelRu: 'Развлечения', labelEn: 'Entertainment' },
    characters_animation: {
        labelRu: 'Персонажи',
        labelEn: 'Characters',
    },
    informative_educational: {
        labelRu: 'Обучение',
        labelEn: 'Informative',
    },
    advertisement: { labelRu: 'Реклама', labelEn: 'Advertisement' },
};

export function mapElevenLabsUseCase(
    raw?: string | null,
): ElevenLabsUseCaseId | undefined {
    const value = raw?.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!value) return undefined;
    if (value in ELEVENLABS_USE_CASE_LABELS) {
        return value as ElevenLabsUseCaseId;
    }
    // Aliases seen in UI / older labels
    if (value === 'narration' || value === 'narrative') {
        return 'narrative_story';
    }
    if (value === 'entertainment') {
        return 'entertainment_tv';
    }
    if (value === 'characters' || value === 'animation') {
        return 'characters_animation';
    }
    if (value === 'informative' || value === 'educational') {
        return 'informative_educational';
    }
    if (value === 'ads' || value === 'ad') {
        return 'advertisement';
    }
    return undefined;
}

export function getElevenLabsUseCaseLabel(
    useCase: ElevenLabsUseCaseId | undefined,
    localeTag: 'ru-RU' | 'en-US',
): string | undefined {
    if (!useCase) return undefined;
    const labels = ELEVENLABS_USE_CASE_LABELS[useCase];
    return localeTag === 'ru-RU' ? labels.labelRu : labels.labelEn;
}

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

    // Prefer curated catalog (includes RU descriptions for professional voices).
    if (catalogVoice) {
        return {
            labelRu: catalogVoice.labelRu,
            labelEn: catalogVoice.labelEn || labelEn,
        };
    }

    const ruFromMap = ELEVENLABS_VOICE_LABELS_RU[shortName.toLowerCase()];

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
