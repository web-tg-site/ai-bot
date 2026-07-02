import { BOT_NAME } from '@/common/config';
import { AiToolId } from '@/common/services/ai/types';
import {
    SubscribePlan,
    SubscribeType,
    UserLanguage,
} from '@/generated/prisma/enums';
import { SUB_PLAN_TYPE_TO_TARIFF_INFO } from '@/common/services/bot/records/sub-plan-type-to-tariff-info.record';
import { formatNumber as formatNum } from '@/common/services/bot/utils/format-number';
import { I18nBundle } from '../types';
import { formatDate, formatNumber } from '../format';

const getTariffIncludesText = (
    type: SubscribeType,
    plan: SubscribePlan,
    i18n: I18nBundle,
) => {
    const info = SUB_PLAN_TYPE_TO_TARIFF_INFO[plan][type]!;

    return [
        i18n.records.tariffIncludes.textRequests(formatNum(info.textRequests)),
        i18n.records.tariffIncludes.images(formatNum(info.images)),
        i18n.records.tariffIncludes.video(formatNum(info.video)),
        i18n.records.tariffIncludes.audio(formatNum(info.audio)),
    ].join('\n');
};

export const ru: I18nBundle = {
    lang: UserLanguage.RU,
    localeTag: 'ru-RU',
    buttons: {
        back: 'Назад',
        start: 'Начать',
        textCategory: '🧠 Текст',
        imageCategory: '🎨 Изображения',
        videoCategory: '🎬 Видео',
        audioCategory: '🎙️ Аудио',
        mySub: 'Моя подписка',
        support: 'Техподдержка',
        settings: '⚙️ Настройки',
        subsTariffs: 'Тарифы подписок',
        freeWeek: '1 Неделя БЕСПЛАТНО',
        activateTrial: 'Активировать тестовый доступ',
        telegram: 'Telegram',
        email: 'Email',
        sbp: (amount) => `СБП ${amount} ₽`,
        usdt: (amount) => `USDT ${amount} ₮`,
    },
    settings: {
        title: '⚙️ <b>Настройки</b>\n\nВыберите язык интерфейса:',
        languageChanged: '✅ Язык изменён',
    },
    languagePicker: {
        prompt: '🌐 <b>Выберите язык / Choose your language</b>',
        ru: '🇷🇺 Русский',
        en: '🇬🇧 English',
    },
    home: {
        notRegistered: `<b>Добро пожаловать в ${BOT_NAME}</b>

Единая AI-платформа в Telegram для работы, бизнеса, творчества и повседневных задач.

Внутри доступны лучшие нейросети мира:

🧠 <b>Текст и анализ</b>
• GPT
• Работа с файлами
• Анализ изображений
• Поиск информации в интернете

🎨 <b>Генерация и редактирование изображений</b>
• Midjourney
• Nano Banana
• Seedream 4.5
• Flux
• GPT Images

🎬 <b>Создание и обработка видео</b>
• Kling
• Veo
• Higgsfield
• HeyGen
• Seedance 2.0
• Topaz AI

🎙️ <b>Работа с голосом и аудио</b>
• ElevenLabs
• Клонирование голоса
• Озвучка видео
• Генерация звуков по запросу

Выберите нужный раздел и начните работу. Все инструменты доступны в одном месте без переключения между десятками сервисов.`,
        registered: `🚀 <b>Все AI-инструменты в одном месте</b>

Выберите направление, с которым хотите работать:
🧠 Текст
🎨 Изображения
🎬 Видео
🎙️ Аудио

Нажмите на нужный раздел ниже.`,
    },
    ai: {
        textBots: `🧠 AI-ассистенты

Выберите модель для работы с текстом, файлами, анализом данных, изображений и поиском информации.

Выберите нужную модель ниже.`,
        imageBots: `🎨 Генерация изображений

Создавайте изображения, концепты, иллюстрации, рекламные креативы и редактируйте готовые фотографии.

Выберите нужную модель ниже.`,
        videoBots: `🎬 Генерация и обработка видео

Создавайте видео с помощью AI, анимируйте изображения и улучшайте качество готовых роликов.

Выберите нужную модель ниже.`,
        audioBots: `🎙️ Работа с аудио

Создавайте озвучку, клонируйте голоса, генерируйте звуки и работайте со звуковым контентом.

Выберите нужный инструмент ниже.`,
    },
    aiResult: {
        voiceCloneStep2:
            '✅ <b>Шаг 1 выполнен</b> — образец голоса получен.\n\n' +
            '<b>Шаг 2:</b> отправьте текст, который нужно озвучить этим голосом.',
        voiceCloneNeedSample:
            '🎙 Сначала отправьте <b>голосовое сообщение</b> или <b>аудиофайл</b> — это образец голоса для клонирования.',
        voiceCloneNeedText:
            '✍️ Теперь отправьте <b>текст</b>, который нужно озвучить клонированным голосом.',
        voiceCloneSampleUpdated:
            '✅ Образец голоса обновлён. Отправьте текст для озвучки.',
        toolSelected: (toolName, instruction) =>
            `🛠 <b>${toolName}</b>\n\n${instruction}\n\n<i>Нажмите «Назад», чтобы выйти из инструмента.</i>`,
        generating: '⏳ Генерация… Подождите немного.',
        asyncStarted:
            '⏳ Генерация запущена. Результат придёт в этот чат, когда будет готов.',
        midjourneyFallback:
            '⚠️ Midjourney через Sharpii сейчас недоступен (сбой на стороне провайдера). Генерирую через Flux…',
        videoToAudioPreparing:
            '⏳ Создаём дубляж… Это может занять несколько минут.',
        insufficientTokens:
            '❌ Недостаточно токенов. Пополните подписку или дождитесь начисления токенов.',
        noSubscription:
            '❌ Для использования AI-инструментов нужна активная подписка.\n\nНажмите «Тарифы подписок», чтобы выбрать план.',
        error: (message) => `❌ Ошибка генерации:\n\n${message}`,
        sendTextOrFile: 'Отправьте текст или файл для генерации.',
        mySubscription: (subscribeType, tokenLeft, subscriptionEndsAt) => {
            const endDate = subscriptionEndsAt
                ? formatDate(subscriptionEndsAt, UserLanguage.RU)
                : '—';

            return `📋 <b>Моя подписка</b>

Тариф: <b>${subscribeType}</b>
Токенов осталось: <b>${formatNumber(tokenLeft, UserLanguage.RU)}</b>
Действует до: <b>${endDate}</b>`;
        },
    },
    subs: {
        chooseSub: `💎 <b>Тарифы ${BOT_NAME}</b>
Получите доступ ко всем возможностям платформы в одном Telegram-боте.
В подписку входит:

✅ GPT и AI-ассистенты
✅ Генерация изображений
✅ Создание и обработка видео
✅ Озвучка и работа с аудио
✅ Доступ ко всем обновлениям платформы

Выберите срок подписки ниже:`,
        subTextForPeriod: (plan) =>
            `📅 <b>Выбранный период: ${ru.records.subPlanToPeriod[plan]}</b>

Теперь выберите подходящий тариф в зависимости от интенсивности использования платформы.

⚡ LITE — для повседневных задач и знакомства с сервисом

🚀 PRO — для регулярной работы с AI-инструментами

👑 BUSINESS — для предпринимателей, команд и активного создания контента
Выберите подходящий тариф ниже.`,
        subTextForSubType: (type, plan) => {
            const info = SUB_PLAN_TYPE_TO_TARIFF_INFO[plan][type]!;

            return `<b>${ru.records.subTypeToText[type]}</b>

Срок доступа: ${ru.records.subPlanToPeriod[plan]}
AI-кредиты: ${formatNum(info.credits)}

${ru.records.subTypeDescription[type]}

В тариф входит:
${getTariffIncludesText(type, plan, ru)}

Способы оплаты:
💳 СБП (карты РФ)
₮ USDT

Выберите тип оплаты ниже.`;
        },
    },
    freeSub: {
        text: `🎁 <b>Тестовый доступ на 7 дней</b>

Попробуйте все возможности ${BOT_NAME} бесплатно.

В течение 7 дней вам будет доступен полный набор нейросетей для работы с текстом, изображениями, видео и аудио.
Лимиты тестового периода:

🧠 До 50 AI-запросов за неделю
🎨 До 5 генераций изображений за неделю
🎬 До 1 генерации видео за неделю
🎙️ До 3 аудио-генераций за неделю

После окончания тестового периода для продолжения работы потребуется оформить подписку.
Полный доступ без ограничений доступен на любом платном тарифе.`,
        activateText: (endsAt) => `✅ <b>Тестовый доступ успешно активирован</b>

Тариф: Тестовый доступ
Действует до: ${endsAt}

Доступ ко всем AI-инструментам платформы открыт.


Нажмите «Начать», чтобы перейти к работе.`,
    },
    subActivate: {
        text: (tariffName, endsAt) => `✅ <b>Подписка успешно активирована</b>

Тариф: ${tariffName}
Действует до: ${endsAt}

Доступ ко всем AI-инструментам платформы открыт.

Нажмите «Начать», чтобы перейти к работе.`,
    },
    support: {
        text: `💬 <b>Поддержка ${BOT_NAME}</b>

Нужна помощь или возник вопрос?

Свяжитесь с нами напрямую, и мы поможем разобраться с любым вопросом: от оплаты и подписки до работы нейросетей и функционала платформы.

📩 Нажмите на удобный для вас способ связи, чтобы обратиться в поддержку.`,
        telegram: `💬 <b>Поддержка ${BOT_NAME}</b>

Напишите нам в Telegram: <a href="https://t.me/project_ai_support">https://t.me/project_ai_support</a>`,
        email: `💬 <b>Поддержка ${BOT_NAME}</b>

Напишите нам на email: <a href="mailto:support@project-ai.com">support@project-ai.com</a>`,
    },
    records: {
        subPlanToPeriod: {
            MONTHLY: '1 месяц',
            THREE_MONTHS: '3 месяца',
            SIX_MONTHS: '6 месяцев',
            YEARLY: '1 год',
        },
        subTypeToText: {
            FREE: 'Бесплатный',
            LITE: '⚡ LITE',
            PRO: '🚀 PRO',
            BUSINESS: '👑 BUSINESS',
            NOT_SUBSCRIBED: 'Не подписан',
        },
        subTypeDescription: {
            LITE: 'Подходит для знакомства с платформой и регулярного использования.',
            PRO: 'Для активной работы с нейросетями, контентом и бизнес-задачами.',
            BUSINESS:
                'Максимальные возможности платформы для бизнеса, команд и профессионального использования.',
        },
        tariffIncludes: {
            textRequests: (n) => `🧠 Тестовых запросов — ${n}`,
            images: (n) => `🎨 Изображений — ${n}`,
            video: (n) => `🎬 Видео (3 сек) — ${n}`,
            audio: (n) => `🎙 Аудио — ${n}`,
        },
    },
    tools: {
        labels: {
            [AiToolId.GPT]: 'GPT',
            [AiToolId.GPT_IMAGES]: 'GPT Images',
            [AiToolId.FLUX]: 'Flux',
            [AiToolId.NANO_BANANA]: 'Nano Banana',
            [AiToolId.SEEDREAM]: 'Seedream 4.5',
            [AiToolId.MIDJOURNEY]: 'Midjourney',
            [AiToolId.KLING]: 'Kling',
            [AiToolId.VEO]: 'Veo',
            [AiToolId.SORA]: 'Sora',
            [AiToolId.SEEDANCE]: 'Seedance 2.0',
            [AiToolId.HIGGSFIELD]: 'Higgsfield',
            [AiToolId.HEYGEN]: 'HeyGen',
            [AiToolId.TOPAZ]: 'Topaz AI',
            [AiToolId.ELEVENLABS_VOICE]: 'ElevenLAbs Voice',
            [AiToolId.VOICE_CLONE]: 'Клонирование голоса',
            [AiToolId.VIDEO_TO_AUDIO]: 'Озвучка видео',
            [AiToolId.SOUND_GENERATOR]: 'Генерация звуков',
        },
        instructions: {
            [AiToolId.GPT]: 'Отправьте текст, фото, файл или видео.',
            [AiToolId.GPT_IMAGES]:
                'Отправьте текстовый промпт для генерации изображения.',
            [AiToolId.FLUX]:
                'Отправьте текстовый промпт или фото с описанием для генерации изображения.',
            [AiToolId.NANO_BANANA]:
                'Отправьте текстовый промпт для генерации изображения.',
            [AiToolId.SEEDREAM]:
                'Отправьте текстовый промпт для генерации изображения.',
            [AiToolId.MIDJOURNEY]:
                'Отправьте текстовый промпт для генерации изображения.',
            [AiToolId.KLING]:
                'Отправьте текстовый промпт или фото для генерации видео (5 сек).',
            [AiToolId.VEO]:
                'Отправьте текстовый промпт или фото для генерации видео (6 сек).',
            [AiToolId.SORA]:
                'Отправьте текстовый промпт для генерации видео (10 сек).',
            [AiToolId.SEEDANCE]:
                'Отправьте текстовый промпт для генерации видео (5 сек).',
            [AiToolId.HIGGSFIELD]:
                'Отправьте текстовый промпт для генерации видео (5 сек).',
            [AiToolId.HEYGEN]:
                'Отправьте текст сценария для генерации видео с аватаром (5 сек).',
            [AiToolId.TOPAZ]:
                'Отправьте видео или фото для улучшения качества (апскейл).',
            [AiToolId.ELEVENLABS_VOICE]:
                'Отправьте текст — бот озвучит его дословно (до 5000 символов).',
            [AiToolId.VOICE_CLONE]:
                '<b>Шаг 1:</b> отправьте голосовое или аудиофайл (образец голоса).\n' +
                '<b>Шаг 2:</b> отправьте текст — бот озвучит его этим голосом.',
            [AiToolId.VIDEO_TO_AUDIO]:
                'Отправьте видео или аудиофайл. Бот сделает дубляж на русский (или укажите язык в подписи: en, es, de…).',
            [AiToolId.SOUND_GENERATOR]:
                'Опишите звук или звуковой эффект (например: «громкий гром», «шаги по гравию», «космический whoosh»).',
        },
    },
};
