import { BOT_NAME } from '@/common/config';
import { SUPPORT_DOCUMENT_URLS } from '@/common/config/support-docs.config';
import { SUPPORT_EMAIL } from '../../utils/format-tech-support';
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
import {
    formatAspectRatioLabel,
    formatAspectRatioToolbarLabel,
    getAspectRatioLabel,
} from '@/common/config/aspect-ratio.config';

const formatAspectRatioLabelRu = (ratio: string) =>
    formatAspectRatioLabel(ratio, 'ru-RU');

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
        privacyPolicy: 'Политика обработки персональных данных',
        userAgreement: 'Пользовательское соглашение',
        refundPolicy: 'Политика возврата денежных средств',
        openApp: 'Открыть приложение',
        sbp: (amount) => `СБП ${amount} ₽`,
        usdt: (amount) => `USDT ${amount} ₮`,
    },
    settings: {
        title: '⚙️ <b>Настройки</b>\n\nВыберите язык интерфейса и параметры генерации:',
        languageChanged: '✅ Язык изменён',
        autoFailover: 'Автопереадресация при сбое',
        autoFailoverOn: '✅ Автопереадресация: вкл',
        autoFailoverOff: '⬜️ Автопереадресация: выкл',
        autoFailoverToggled: (enabled) =>
            enabled
                ? '✅ Автопереадресация включена'
                : '⬜️ Автопереадресация выключена',
        openButton: '⚙️ Настройки',
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
• Seedream
• Flux
• Sora

🎬 <b>Создание и обработка видео</b>
• Kling
• Veo
• Higgsfield
• HeyGen
• Seedance
• Luma Ray
• Topaz AI

🎙️ <b>Работа с голосом и аудио</b>
• ElevenLabs
• Клонирование голоса
• Озвучка видео
• Генерация звуков по запросу
• Suno

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

Создавайте озвучку, клонируйте голоса, генерируйте звуки и песни, работайте со звуковым контентом.

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
        jobCompleted: (toolName) =>
            `✅ Генерация в <b>${toolName}</b> завершена.`,
        generating: '⏳ Генерация… Подождите немного.',
        asyncStarted:
            '⏳ Генерация запущена. Результат придёт в этот чат, когда будет готов.',
        midjourneyFallback:
            '⚠️ Midjourney сейчас недоступен (сбой на стороне провайдера). Генерирую через Flux…',
        failoverRedirect: (fromName, toName, settingsUrl) => {
            const settingsLabel = settingsUrl
                ? `<a href="${settingsUrl}">настройки</a>`
                : 'настройки';
            return (
                `К сожалению сейчас сильная очередь в <b>${fromName}</b>, ` +
                `для более быстрой генерации мы переадресуем запрос в <b>${toName}</b>, ` +
                `чтобы убрать функцию переадресации — перейдите в ${settingsLabel} для отключения.`
            );
        },
        midjourneyActionsHint:
            '🖼 Выберите действие: U1–U4 — увеличить, V1–V4 — вариации.',
        sunoActionsHint:
            '🎵 Выберите трек и действие: Extend, Cover, Vocals или Stems.',
        midjourneyInpaintPrompt:
            '🎨 <b>Vary Region</b>: отправьте чёрно-белую маску (белое = перерисовать) и при желании подпись с новым промптом.',
        sunoExtendPrompt:
            '⏭ <b>Extend</b>: опишите продолжение (или отправьте «.» чтобы продолжить без нового текста).',
        sunoCoverPrompt:
            '🎤 <b>Cover</b>: опишите новый стиль (жанр/настроение) для кавера.',
        generationTakingLonger:
            '⏳ Генерация занимает больше времени, чем обычно. Пожалуйста, подождите…',
        videoToAudioPreparing:
            '⏳ Создаём дубляж… Это может занять несколько минут.',
        insufficientTokens:
            '❌ Недостаточно токенов. Пополните подписку или дождитесь начисления токенов.',
        noSubscription:
            '❌ Для использования AI-инструментов нужна активная подписка.\n\nНажмите «Тарифы подписок», чтобы выбрать план.',
        error: (message) => `❌ Ошибка генерации:\n\n${message}`,
        errorWithCode: (code, message) => `❌ Ошибка #${code}\n\n${message}`,
        tokensRefunded: (amount) =>
            `↩️ Возвращено <b>${amount}</b> токенов на баланс.`,
        errorByCode: {
            1: 'Что-то пошло не так. Попробуйте ещё раз или выберите другой инструмент.',
            10: 'Сервис временно недоступен. Попробуйте позже.',
            11: 'Генерация заняла слишком много времени. Попробуйте ещё раз.',
            12: 'Сбой на стороне провайдера. Попробуйте позже или выберите другой инструмент.',
            13: 'Не удалось отправить результат. Попробуйте ещё раз.',
            14: 'Не удалось проверить статус генерации. Попробуйте позже.',
            15: 'Модель отклонила запрос из‑за ограничений безопасности. Измените описание и попробуйте снова.',
        },
        userErrors: {
            prohibitedContent:
                'Модель отклонила запрос: запрещённый контент. Измените описание и попробуйте снова.',
            sexuallyExplicit:
                'Модель отклонила запрос: откровенный контент. Измените описание и попробуйте снова.',
            hateSpeech:
                'Модель отклонила запрос: контент с разжиганием ненависти. Измените описание и попробуйте снова.',
            harassment:
                'Модель отклонила запрос: оскорбления или травля. Измените описание и попробуйте снова.',
            dangerousContent:
                'Модель отклонила запрос: опасный контент. Измените описание и попробуйте снова.',
            civicIntegrity:
                'Модель отклонила запрос из‑за ограничений по общественно-политическому контенту. Измените описание и попробуйте снова.',
            imageSafety:
                'Изображение не прошло проверку безопасности. Измените описание или фото и попробуйте снова.',
            safetyBlocked:
                'Модель отклонила запрос из‑за ограничений безопасности. Измените описание и попробуйте снова.',
            contentPolicy:
                'Запрос не прошёл проверку политики контента. Измените описание и попробуйте снова.',
            rateLimit:
                'Слишком много запросов. Подождите немного и попробуйте снова.',
            voicePreviewFailed:
                'Не удалось загрузить превью голоса. Попробуйте позже.',
            generationFailed:
                'Генерация не удалась. Попробуйте ещё раз или выберите другой инструмент.',
            sendFailed: 'Не удалось отправить сообщение. Попробуйте позже.',
            mediaDownloadFailed:
                'Не удалось загрузить файл. Попробуйте ещё раз.',
            invoiceFailed:
                'Не удалось создать счёт на оплату. Попробуйте позже.',
            checkoutFailed: 'Не удалось создать платёж. Попробуйте позже.',
        },
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
🎙️ До 2 аудио-генераций за неделю

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
    payment: {
        invoiceCreated: (amountUsd, tariffName, periodName) =>
            `💳 <b>Оплата подписки</b>

Тариф: ${tariffName}
Период: ${periodName}
Сумма: ~${amountUsd} USDT (можно оплатить любой криптовалютой)

Нажмите кнопку ниже, чтобы перейти к оплате в @send.
Ссылка действительна 1 час.`,
        invoiceCreatedRub: (amountRub, tariffName, periodName) =>
            `💳 <b>Оплата подписки</b>

Тариф: ${tariffName}
Период: ${periodName}
Сумма: ${amountRub} ₽

Нажмите кнопку ниже — откроется страница оплаты (карта / СБП).
Важно: откройте ссылку в браузере телефона (не через VPN).`,
        payButton: 'Оплатить',
        success: (tariffName, periodName, endsAt) =>
            `✅ <b>Оплата получена, подписка активирована</b>

Тариф: ${tariffName}
Период: ${periodName}
Действует до: ${endsAt}

Доступ ко всем AI-инструментам платформы открыт.`,
        error: 'Не удалось создать счёт на оплату. Попробуйте позже или обратитесь в поддержку.',
        askEmail:
            'Для оплаты в рублях укажите ваш email одним сообщением.\nОн сохранится для следующих платежей.',
        emailInvalid:
            'Некорректный email. Пример: name@example.com\nОтправьте email ещё раз.',
        notConfigured:
            'Оплата через @send временно недоступна. Обратитесь в поддержку.',
        rubNotConfigured:
            'Оплата в рублях временно недоступна. Пока вы можете оплатить криптовалютой через кнопку USDT.',
    },
    support: {
        text: `💬 <b>Поддержка ${BOT_NAME}</b>

Нужна помощь или возник вопрос?

Свяжитесь с нами напрямую, и мы поможем разобраться с любым вопросом: от оплаты и подписки до работы нейросетей и функционала платформы.

📩 Нажмите на удобный для вас способ связи, чтобы обратиться в поддержку.`,
        telegram: `Здравствуйте, напишите, пожалуйста, свой вопрос ниже👀`,
        telegramSuccess: `Спасибо!

Мы приняли ваш запрос, и в ближайшее время начнем работу над вашей проблемой, если у нас появятся какие-то вопросы уточняющие, то с вами свяжется наш менеджер, спасибо за понимание, хорошего дня🫶🏿`,
        telegramNotText: `Пожалуйста, отправьте обращение текстом.`,
        telegramTooShort: `Сообщение слишком короткое. Напишите не менее 5 символов.`,
        telegramSendFailed: `Не удалось отправить обращение. Попробуйте позже.`,
        email: `💬 <b>Поддержка ${BOT_NAME}</b>

Напишите нам на email: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`,
        privacyPolicy: `📄 <b>Политика обработки персональных данных</b>

<a href="${SUPPORT_DOCUMENT_URLS.privacyPolicy}">Открыть документ</a>`,
        userAgreement: `📄 <b>Пользовательское соглашение</b>

<a href="${SUPPORT_DOCUMENT_URLS.userAgreement}">Открыть документ</a>`,
        refundPolicy: `📄 <b>Политика возврата денежных средств</b>

<a href="${SUPPORT_DOCUMENT_URLS.refundPolicy}">Открыть документ</a>`,
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
            [AiToolId.CLAUDE_SONNET]: 'Claude Sonnet',
            [AiToolId.GPT_IMAGES]: 'Sora',
            [AiToolId.FLUX]: 'Flux',
            [AiToolId.NANO_BANANA]: 'Nano Banana',
            [AiToolId.SEEDREAM]: 'Seedream',
            [AiToolId.MIDJOURNEY]: 'Midjourney',
            [AiToolId.KLING]: 'Kling',
            [AiToolId.KLING_MOTION]: 'Kling Motion',
            [AiToolId.VEO]: 'Veo',
            [AiToolId.SORA]: 'Sora',
            [AiToolId.SEEDANCE]: 'Seedance',
            [AiToolId.LUMA_RAY]: 'Luma Ray',
            [AiToolId.HIGGSFIELD]: 'Higgsfield',
            [AiToolId.HEYGEN]: 'HeyGen',
            [AiToolId.TOPAZ]: 'Topaz AI',
            [AiToolId.ELEVENLABS_VOICE]: 'ElevenLAbs Voice',
            [AiToolId.VOICE_CLONE]: 'Клонирование голоса',
            [AiToolId.VIDEO_TO_AUDIO]: 'Озвучка видео',
            [AiToolId.SOUND_GENERATOR]: 'Генерация звуков',
            [AiToolId.SUNO]: 'Suno',
        },
        instructions: {
            [AiToolId.GPT]: 'Отправьте текст, фото, файл или видео.',
            [AiToolId.CLAUDE_SONNET]: 'Отправьте текст, фото, файл или видео.',
            [AiToolId.GPT_IMAGES]:
                'Опишите задачу и при желании добавьте референсы (до 10 изображений). Чем точнее вы укажете роль каждого изображения, тем предсказуемее будет результат.',
            [AiToolId.FLUX]:
                'Flux 2 Pro: генерация и редактирование по промпту (до 8 референсов). Одно фото без текста — улучшение резкости. Два фото (исходник + маска) — удаление объекта. Человек + одежда — virtual try-on. В параметрах можно расширить кадр (outpaint).',
            [AiToolId.NANO_BANANA]:
                'Опишите задачу и при желании добавьте референсы (до 10 изображений). Чем точнее вы укажете роль каждого изображения, тем предсказуемее будет результат.',
            [AiToolId.SEEDREAM]:
                'Опишите задачу и при желании добавьте референсы (до 10 изображений). Чем точнее вы укажете роль каждого изображения, тем предсказуемее будет результат.',
            [AiToolId.MIDJOURNEY]:
                'Опишите задачу и при желании добавьте референсы (до 10 изображений).',
            [AiToolId.KLING]:
                'Прикрепите до 4 фото (можно пропустить), настройте STD/PRO, звук и опишите сцену.',
            [AiToolId.KLING_MOTION]:
                'Загрузите фото персонажа и видео движения. «Поза с фото» — клип короче 10 сек; «Поза из видео» — до 30 сек. Промпт необязателен.',
            [AiToolId.VEO]:
                'Прикрепите фото или видео-референсы (можно пропустить), настройте параметры и опишите сцену.',
            [AiToolId.SORA]:
                'OpenAI Sora: 4/8/12 сек, одно фото или видео для редактирования, продление готового ролика, персонажи без лиц людей.',
            [AiToolId.SEEDANCE]:
                'Опишите сцену (до 30 сек). Можно прикрепить до 30 фото, до 10 видео и до 10 аудио-референсов.',
            [AiToolId.LUMA_RAY]:
                'Прикрепите фото или видео. Видео + промпт — редактирование. Видео без промпта — смена формата кадра в параметрах.',
            [AiToolId.HIGGSFIELD]:
                'Загрузите референс (можно пропустить), настройте параметры и опишите сцену.',
            [AiToolId.HEYGEN]:
                'Текст сценария или голосовой файл озвучки. Можно прикрепить фото — будет говорящий портрет.',
            [AiToolId.TOPAZ]: 'Отправьте фото или видео для апскейла.',
            [AiToolId.ELEVENLABS_VOICE]:
                'Отправьте текст — бот озвучит его дословно (до 5000 символов).',
            [AiToolId.VOICE_CLONE]:
                '<b>Шаг 1:</b> отправьте голосовое или аудиофайл (образец голоса).\n' +
                '<b>Шаг 2:</b> отправьте текст — бот озвучит его этим голосом.',
            [AiToolId.VIDEO_TO_AUDIO]:
                'Отправьте видео или аудиофайл. Бот сделает дубляж на русский (или укажите язык: en, «на английском», es, de…).',
            [AiToolId.SOUND_GENERATOR]:
                'Опишите именно звук, а не сцену (лучше: «стук каблуков по металлу», а не «девушка идёт»). Длительность — в «⚙️ Параметры».',
            [AiToolId.SUNO]:
                'Отправьте текстом описание песни — генерация начнётся сразу. Жанр, настроение, инструментал и текст песни — в «⚙️ Параметры».',
        },
    },
    gptChat: {
        newChat: '➕ Новый чат',
        myChats: '📂 Мои чаты',
        clearHistory: '🗑 Очистить историю',
        webSearchOn: '🌐 Поиск: вкл',
        webSearchOff: '🌐 Поиск: выкл',
        replyModeLabel: (mode) => {
            if (mode === 'audio') return '🔊 Ответ: аудио';
            if (mode === 'both') return '🔊 Ответ: текст + аудио';
            return '💬 Ответ: текст';
        },
        newChatCreated: '✅ Создан новый чат. Можете начинать диалог.',
        chatListTitle: '📂 <b>Ваши чаты</b>\n\nВыберите диалог:',
        noChats: 'Пока нет сохранённых чатов',
        chatNotFound: 'Чат не найден',
        chatOpened: (title, lastMessage) => {
            const preview = lastMessage
                ? `\n\n<i>Последнее сообщение:</i>\n${lastMessage.slice(0, 200)}${lastMessage.length > 200 ? '…' : ''}`
                : '\n\n<i>История пуста — напишите первое сообщение.</i>';
            return `💬 <b>${title}</b>${preview}`;
        },
        clearConfirm:
            '⚠️ <b>Очистить историю текущего чата?</b>\n\nСообщения будут удалены без возможности восстановления.',
        confirmClear: '✅ Да, очистить',
        cancelClear: '❌ Отмена',
        deleteChatConfirm: (title) =>
            `⚠️ <b>Удалить чат?</b>\n\n«${title}»\n\nЧат и все сообщения будут удалены без возможности восстановления.`,
        confirmDeleteChat: '✅ Да, удалить',
        cancelDeleteChat: '❌ Отмена',
        chatDeleted: '✅ Чат удалён',
        deleteChatCancelled: 'Удаление отменено',
        noActiveChat: 'Нет активного чата',
        historyCleared: '✅ История чата очищена',
        clearCancelled: 'Очистка отменена',
        webSearchEnabled: 'Поиск в интернете включён',
        webSearchDisabled: 'Поиск в интернете выключен',
        webSearchAlwaysOn: 'Поиск в интернете всегда включён',
        replyModeChanged: (mode) => {
            if (mode === 'audio') return 'Режим ответа: только аудио';
            if (mode === 'both') return 'Режим ответа: текст и аудио';
            return 'Режим ответа: только текст';
        },
        controlsHint:
            'Управление чатом:\n• Новый чат — начать отдельный диалог\n• Мои чаты — переключиться между диалогами\n• Поиск в интернете всегда включён',
    },
    imageTool: {
        promptHint: 'Опишите задачу.',
        refAdded: (count, max) => `✅ Референс добавлен: ${count}/${max}`,
        refDeleteButton: '🗑 Удалить',
        refDeleted: '🗑 Референс удалён',
        refNotFound: 'Референс уже удалён или не найден',
        refLimitReached: (max) =>
            `⚠️ Лимит референсов (${max}). Нажмите «К промпту».`,
        needPhotoOnRefStep:
            'Отправьте фото-референсы или нажмите «Пропустить» / «К промпту».',
        needPrompt: 'Отправьте промпт для генерации.',
        aspectRatioButton: (ratio) => `📐 Формат: ${ratio}`,
        resolutionButton: (resolution) => `🖼 Разрешение: ${resolution}`,
        formatToolbarButton: (ratio) =>
            formatAspectRatioToolbarLabel(ratio, 'ru-RU'),
        changeFormatButton: '📐 Изменить формат',
        changeResolutionButton: '🖼 Изменить разрешение',
        changeQualityButton: '✨ Изменить качество',
        changeFluxModeButton: '🎛 Режим Flux',
        nanoThinkingButton: (high) =>
            high ? '✨ Качество: лучше' : '⚡️ Качество: быстрее',
        nanoSearchButton: (on) =>
            on ? '🌐 Поиск: да' : '🌐 Поиск: нет',
        nanoThinkingChanged: (high) =>
            high
                ? 'Режим «лучше»: дольше, но аккуратнее'
                : 'Режим «быстрее»: обычная генерация',
        nanoSearchChanged: (on) =>
            on
                ? 'Поиск включён: можно подсмотреть свежие факты в сети'
                : 'Поиск выключен',
        nanoSearchAlwaysOn: 'Поиск всегда включён',
        resolutionToolbarButton: (resolution) => `🖼 ${resolution}`,
        selectAspectRatioTitle: 'Выберите формат:',
        selectResolutionTitle: 'Выберите разрешение:',
        selectQualityTitle: 'Выберите качество:',
        selectFluxModeTitle: 'Выберите режим Flux:',
        aspectRatioPickerOption: (ratio) => formatAspectRatioLabelRu(ratio),
        aspectRatioPickerSelected: (ratio) =>
            `✓ ${formatAspectRatioLabelRu(ratio)}`,
        resolutionPickerOption: (resolution, tokens) =>
            `${resolution} · ${tokens} ток.`,
        resolutionPickerSelected: (resolution, tokens) =>
            `✓ ${resolution} · ${tokens} ток.`,
        qualityPickerOption: (label, tokens) => `${label} · ${tokens} ток.`,
        qualityPickerSelected: (label, tokens) => `✓ ${label} · ${tokens} ток.`,
        aspectRatioChanged: (ratio) =>
            `Формат: ${formatAspectRatioLabelRu(ratio)}`,
        resolutionChanged: (resolution, tokens) =>
            `Разрешение: ${resolution} (${tokens} токенов)`,
        qualityChanged: (label, tokens) =>
            `Качество: ${label} (${tokens} токенов)`,
        fluxModePickerOption: (label) => label,
        fluxModePickerSelected: (label) => `✓ ${label}`,
        fluxModeChanged: (label) => `Режим Flux: <b>${label}</b>`,
        topazScaleButton: (scale, tokens, selected) =>
            `${selected ? '✓ ' : ''}×${scale} (${tokens} ток.)`,
        topazScaleChanged: (scale, tokens) =>
            `Масштаб апскейла: ×${scale} (${tokens} токенов)`,
        continueToPrompt: '➡️ К промпту',
        skipRefs: '⏭ Пропустить',
        settingsButton: '⚙️ Параметры',
        backToSettings: '◀️ Назад',
        backToEditor: '◀️ К редактору',
        settingsMenuTitle: 'Настройки генерации',
        keyboardUpdated: (toolName) => toolName,
        formatLine: (format, resolution, quality) => {
            const parts = [
                `Формат: <b>${getAspectRatioLabel(format, 'ru-RU')}</b> · <b>${format}</b>`,
            ];
            if (resolution) {
                parts.push(`<b>${resolution}</b>`);
            }
            if (quality) {
                parts.push(`<b>${quality}</b>`);
            }
            return parts.join(' · ');
        },
        sendAsFileButton: (asFile) =>
            asFile ? '✓ Отправлять файлом' : '📎 Отправлять файлом',
        sendAsFileChanged: (asFile) =>
            asFile
                ? 'Результат будет отправлен <b>файлом</b>'
                : 'Результат будет отправлен <b>как фото</b>',
        deliveryLine: (asFile) =>
            asFile ? 'Отправка: <b>файлом</b>' : 'Отправка: <b>как фото</b>',
    },
    videoTool: {
        promptHint: 'Опишите сцену и движение камеры.',
        refAdded: (count, max) => `✅ Референс добавлен: ${count}/${max}`,
        refDeleteButton: '🗑 Удалить',
        refDeleted: '🗑 Референс удалён',
        refNotFound: 'Референс уже удалён или не найден',
        refLimitReached: (max) =>
            `⚠️ Лимит референсов (${max}). Нажмите «К промпту».`,
        needPhotoOnRefStep:
            'Отправьте фото, видео или аудио — что принимает этот редактор — или нажмите «Пропустить» / «К промпту».',
        needPrompt: 'Отправьте промпт для генерации видео.',
        aspectRatioButton: (ratio) => `📐 Формат: ${ratio}`,
        resolutionButton: (resolution) => `🖼 Разрешение: ${resolution}`,
        formatToolbarButton: (ratio) =>
            formatAspectRatioToolbarLabel(ratio, 'ru-RU'),
        changeFormatButton: '📐 Изменить формат',
        changeResolutionButton: '🖼 Изменить разрешение',
        changeQualityButton: '✨ Изменить качество',
        changeDurationButton: '⏱ Изменить длительность',
        changeStyleButton: '🎨 Изменить стиль',
        changeEffectButton: '✨ Изменить эффект',
        changeHeygenVoiceButton: '🎙 Голос',
        changeHeygenAvatarButton: '🧑 Аватар',
        changeHeygenEngineButton: '🧠 Движок',
        changeHeygenBackgroundButton: '🖼 Фон',
        changeHeygenExpressivenessButton: '🎭 Выразительность',
        changeHeygenSpeedButton: '⏩ Скорость речи',
        changeHeygenPitchButton: '🎵 Высота тона',
        toggleHeygenCaptionsButton: (enabled) =>
            enabled ? '✓ Субтитры' : '💬 Субтитры',
        heygenCaptionsChanged: (enabled) =>
            enabled
                ? 'Субтитры: <b>включены</b>'
                : 'Субтитры: <b>выключены</b>',
        selectHeygenVoiceTitle: 'Выберите голос HeyGen:',
        selectHeygenAvatarTitle: 'Выберите аватар HeyGen:',
        selectHeygenEngineTitle: 'Выберите движок:',
        selectHeygenBackgroundTitle: 'Выберите фон:',
        selectHeygenExpressivenessTitle: 'Выберите выразительность:',
        selectHeygenSpeedTitle: 'Скорость речи:',
        selectHeygenPitchTitle: 'Высота тона:',
        heygenVoiceChanged: (name) => `Голос: <b>${name}</b>`,
        heygenAvatarChanged: (name) => `Аватар: <b>${name}</b>`,
        heygenEngineChanged: (label) => `Движок: <b>${label}</b>`,
        heygenBackgroundChanged: (label) => `Фон: <b>${label}</b>`,
        heygenExpressivenessChanged: (label) =>
            `Выразительность: <b>${label}</b>`,
        heygenSpeedChanged: (speed) => `Скорость речи: <b>${speed}x</b>`,
        heygenPitchChanged: (pitch) => `Высота тона: <b>${pitch}</b>`,
        heygenPickerOption: (label) => label,
        heygenPickerSelected: (label) => `✓ ${label}`,
        heygenNextPage: '▶️ Далее',
        heygenPrevPage: '◀️ Назад',
        heygenPageLabel: (page, total) => `Стр. ${page}/${total}`,
        heygenVoicePreviewFailed: 'Не удалось загрузить превью голоса.',
        resolutionToolbarButton: (resolution) => `🖼 ${resolution}`,
        selectAspectRatioTitle: 'Выберите формат:',
        selectResolutionTitle: 'Выберите разрешение:',
        selectQualityTitle: 'Выберите качество:',
        selectDurationTitle: 'Выберите длительность:',
        selectStyleTitle: 'Выберите стиль:',
        selectEffectTitle: 'Выберите эффект:',
        noEffectLabel: 'Без эффекта',
        aspectRatioPickerOption: (ratio) => formatAspectRatioLabelRu(ratio),
        aspectRatioPickerSelected: (ratio) =>
            `✓ ${formatAspectRatioLabelRu(ratio)}`,
        resolutionPickerOption: (resolution, tokens) =>
            `${resolution} · ${tokens} ток.`,
        resolutionPickerSelected: (resolution, tokens) =>
            `✓ ${resolution} · ${tokens} ток.`,
        qualityPickerOption: (label, tokens) => `${label} · ${tokens} ток.`,
        qualityPickerSelected: (label, tokens) => `✓ ${label} · ${tokens} ток.`,
        aspectRatioChanged: (ratio) =>
            `Формат: ${formatAspectRatioLabelRu(ratio)}`,
        resolutionChanged: (resolution, tokens) =>
            `Разрешение: ${resolution} (${tokens} токенов)`,
        qualityChanged: (label, tokens) =>
            `Качество: ${label} (${tokens} токенов)`,
        durationToolbarButton: (seconds, credits) =>
            `⏱ ${seconds} сек · ${credits} ток.`,
        durationPickerOption: (seconds, credits) =>
            `${seconds} сек · ${credits} ток.`,
        durationPickerSelected: (seconds, credits) =>
            `✓ ${seconds} сек · ${credits} ток.`,
        durationChanged: (seconds, credits) =>
            `Длительность: ${seconds} сек (${credits} токенов)`,
        styleToolbarButton: (styleLabel) => `🎨 ${styleLabel}`,
        stylePickerOption: (styleLabel) => styleLabel,
        stylePickerSelected: (styleLabel) => `✓ ${styleLabel}`,
        styleChanged: (styleLabel) => `Стиль: ${styleLabel}`,
        effectPickerOption: (effectLabel) => effectLabel,
        effectPickerSelected: (effectLabel) => `✓ ${effectLabel}`,
        effectChanged: (effectLabel) => `Эффект: ${effectLabel}`,
        continueToPrompt: '➡️ К промпту',
        skipRefs: '⏭ Пропустить',
        settingsButton: '⚙️ Параметры',
        backToSettings: '◀️ Назад',
        backToEditor: '◀️ К редактору',
        settingsMenuTitle: 'Настройки видео',
        keyboardUpdated: (toolName) => toolName,
        formatLine: (format, resolution, quality) => {
            const parts = [
                `Формат: <b>${getAspectRatioLabel(format, 'ru-RU')}</b> · <b>${format}</b>`,
            ];
            if (resolution) {
                parts.push(`<b>${resolution}</b>`);
            }
            if (quality) {
                parts.push(`<b>${quality}</b>`);
            }
            return parts.join(' · ');
        },
        durationLabel: (seconds) =>
            seconds >= 60 ? '1 мин' : `${seconds} сек`,
        summaryLine: ({
            format,
            resolution,
            qualityLabel,
            durationSeconds,
            styleLabel,
            effectLabel,
            heygenVoiceLabel,
            heygenAvatarLabel,
            heygenEngineLabel,
            credits,
        }) => {
            const parts: string[] = [];
            if (format) {
                parts.push(
                    `<b>${getAspectRatioLabel(format, 'ru-RU')}</b> · <b>${format}</b>`,
                );
            }
            if (resolution) {
                parts.push(`<b>${resolution}</b>`);
            }
            if (qualityLabel) {
                parts.push(`<b>${qualityLabel}</b>`);
            }
            if (durationSeconds) {
                parts.push(
                    durationSeconds >= 60
                        ? '<b>1 мин</b>'
                        : `<b>${durationSeconds} сек</b>`,
                );
            }
            if (styleLabel) {
                parts.push(`<b>${styleLabel}</b>`);
            }
            if (effectLabel) {
                parts.push(`✨ <b>${effectLabel}</b>`);
            }
            if (heygenAvatarLabel) {
                parts.push(`🧑 <b>${heygenAvatarLabel}</b>`);
            }
            if (heygenVoiceLabel) {
                parts.push(`🎙 <b>${heygenVoiceLabel}</b>`);
            }
            if (heygenEngineLabel) {
                parts.push(`🧠 <b>${heygenEngineLabel}</b>`);
            }
            if (credits) {
                parts.push(`~<b>${credits}</b> токенов`);
            }
            return parts.join(' · ');
        },
        sendAsFileButton: (asFile) =>
            asFile ? '✓ Отправлять файлом' : '📎 Отправлять файлом',
        sendAsFileChanged: (asFile) =>
            asFile
                ? 'Результат будет отправлен <b>файлом</b>'
                : 'Результат будет отправлен <b>как видео</b>',
        deliveryLine: (asFile) =>
            asFile ? 'Отправка: <b>файлом</b>' : 'Отправка: <b>как видео</b>',
        changeSoraCharactersButton: '👤 Персонажи Sora',
        createSoraCharacterButton: '➕ Создать персонажа',
        soraCharactersEmpty: 'Персонажей пока нет',
        soraCharacterOption: (name) => name,
        soraCharacterSelected: (name) => `✓ ${name}`,
        selectSoraCharactersTitle:
            'Выберите до 2 персонажей (имя должно быть в промпте):',
        soraCharactersChanged: (count) =>
            count > 0
                ? `Персонажи для генерации: <b>${count}</b>`
                : 'Персонажи не выбраны',
        soraExtendButton: '➕ Продлить видео',
        soraExtendHint:
            'Можно продлить этот ролик — нажмите кнопку ниже и опишите продолжение.',
        soraExtendPromptHint:
            'Режим <b>продления Sora</b>. Опишите, как продолжить сцену (4–20 сек).',
        soraFaceWarning:
            '⚠️ Фото с лицами людей могут быть отклонены OpenAI Sora.',
        soraNeedCharacterVideo:
            'Отправьте короткое видео персонажа (2–4 сек, без человеческих лиц).',
        soraNeedCharacterName: 'Введите имя персонажа (латиница или кириллица):',
        soraCharacterCreated: (name) =>
            `Персонаж <b>${name}</b> создан и сохранён.`,
        selectExtendDurationTitle: 'Длительность продления (4–20 сек):',
    },
    voiceTool: {
        selectVoiceButton: '🎙 Доступные голоса',
        genderFemaleButton: '👩 Женский',
        genderMaleButton: '👨 Мужской',
        selectGenderTitle: 'Выберите пол голоса:',
        backToGenderList: '◀️ К полу',
        confirmVoiceButton: '✓ Подтвердить',
        rejectVoiceButton: '✗ Нет',
        backToVoiceList: '◀️ К списку',
        backToEditor: '◀️ К редактору',
        settingsMenuTitle: 'Доступные голоса',
        previewGenerating: '⏳ Генерирую пример голоса...',
        previewCaption: (voiceName) =>
            `Пример голоса: <b>${voiceName}</b>\n\nПодтвердите или выберите другой.`,
        voiceConfirmed: (voiceName) => `✅ Голос выбран: <b>${voiceName}</b>`,
        voiceRejected: 'Выберите другой голос из списка.',
        voiceLine: (voiceName) => `Голос: <b>${voiceName}</b>`,
        voicePickerOption: (voiceName) => voiceName,
        voicePickerSelected: (voiceName) => `✓ ${voiceName}`,
        keyboardUpdated: (toolName) => toolName,
        sendAsFileButton: (asFile) =>
            asFile ? '✓ Аудиофайлом' : '🎙 Голосовым сообщением',
        sendAsFileChanged: (asFile) =>
            asFile
                ? 'Результат будет отправлен <b>аудиофайлом</b>'
                : 'Результат будет отправлен <b>голосовым сообщением</b>',
        deliveryLine: (asFile) =>
            asFile
                ? 'Отправка: <b>аудиофайлом</b>'
                : 'Отправка: <b>голосовым сообщением</b>',
        durationLine: (seconds, tokens) =>
            `Длительность: <b>${formatSunoDurationRu(seconds)}</b> · <b>${tokens}</b> ток.`,
        durationPickerOption: (seconds, tokens) =>
            `${formatSunoDurationRu(seconds)} · ${tokens} ток.`,
        durationPickerSelected: (seconds, tokens) =>
            `✓ ${formatSunoDurationRu(seconds)} · ${tokens} ток.`,
        durationChanged: (seconds, tokens) =>
            `Длительность: ${formatSunoDurationRu(seconds)} (${tokens} токенов)`,
        promptHint:
            '✍️ Отправьте промпт сообщением — генерация запустится сразу.',
        settingsButton: '⚙️ Параметры',
        changeDurationButton: '⏱ Изменить длительность',
        changeGenreButton: (currentLabel) => `🎵 Жанр: ${currentLabel}`,
        changeMoodButton: (currentLabel) => `🌤 Настроение: ${currentLabel}`,
        instrumentalButton: (enabled) =>
            enabled ? '✓ Инструментал' : '🎹 Инструментал',
        lyricsButton: (hasLyrics) =>
            hasLyrics ? '✓ Текст песни' : '📝 Текст песни',
        clearLyricsButton: '🗑 Очистить текст песни',
        genrePickerOption: (label) => label,
        genrePickerSelected: (label) => `✓ ${label}`,
        moodPickerOption: (label) => label,
        moodPickerSelected: (label) => `✓ ${label}`,
        selectGenreTitle: 'Выберите жанр:',
        selectMoodTitle: 'Выберите настроение:',
        enterLyricsTitle:
            'Отправьте текст песни следующим сообщением. Можно очистить сохранённый текст кнопкой ниже.',
        lyricsSaved: 'Текст песни сохранён.',
        lyricsCleared: 'Текст песни очищен.',
        genreChanged: (label) => `Жанр: <b>${label}</b>`,
        moodChanged: (label) => `Настроение: <b>${label}</b>`,
        instrumentalChanged: (enabled) =>
            enabled
                ? 'Режим: <b>инструментал</b> (без вокала)'
                : 'Режим: <b>с вокалом</b>',
        genreLine: (label, active) =>
            active ? `Жанр: <b>${label}</b>` : 'Жанр: <b>не выбран</b>',
        moodLine: (label, active) =>
            active
                ? `Настроение: <b>${label}</b>`
                : 'Настроение: <b>не выбрано</b>',
        instrumentalLine: (enabled) =>
            enabled ? 'Вокал: <b>инструментал</b>' : 'Вокал: <b>с вокалом</b>',
        lyricsLine: (hasLyrics) =>
            hasLyrics
                ? 'Текст песни: <b>задан</b>'
                : 'Текст песни: <b>не задан</b>',
        backToSettings: '◀️ Назад',
        selectDurationTitle: 'Выберите длительность:',
        parametersMenuTitle: 'Параметры',
    },
};

function formatSunoDurationRu(seconds: number): string {
    if (seconds >= 60 && seconds % 60 === 0) {
        const minutes = seconds / 60;
        return minutes === 1 ? '1 мин' : `${minutes} мин`;
    }
    return `${seconds} сек`;
}
