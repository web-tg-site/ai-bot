import { AiToolId } from '@/common/services/ai/types';

const RU: Partial<Record<AiToolId, string>> = {
    [AiToolId.GPT]: `GPT — универсальный помощник для текста, идей, файлов и изображений.

Что можно делать
• писать тексты, посты и сценарии
• анализировать документы и таблицы
• править код
• разбирать изображения
• составлять планы

Как пользоваться
1. Опишите задачу.
2. Чем подробнее контекст — тем точнее результат.
3. При необходимости прикрепите файл, фото или видео.
4. Если нужно изменить ответ — продолжайте диалог.`,

    [AiToolId.CLAUDE_SONNET]: `Claude — помощник для длинных текстов, документов, кода и сложного анализа.

Что можно делать
• анализировать документы и данные
• писать и редактировать тексты
• программировать
• структурировать исследования

Как пользоваться
1. Напишите задачу и добавьте контекст.
2. Укажите желаемый формат ответа.
3. При необходимости прикрепите файл, фото или видео.
4. Продолжайте диалог для уточнений.`,

    [AiToolId.MIDJOURNEY]: `Midjourney — генерация и редактирование изображений. Основной вариант — V8.1.

Что можно делать
• создавать изображения с нуля
• рекламу, fashion, персонажей, интерьеры
• переносить стиль референса
• редактировать готовые кадры

Как пользоваться
1. Опишите изображение.
2. При необходимости загрузите референс.
3. Выберите соотношение сторон и стиль.
4. Запустите генерацию.`,

    [AiToolId.NANO_BANANA]: `Nano Banana — модели Google для создания и редактирования фото по тексту.

Что можно делать
• генерация по описанию
• смена фона и одежды
• удаление или добавление объектов
• объединение нескольких изображений

Как пользоваться
1. Напишите, что хотите получить.
2. Загрузите исходник или референс, если работаете с готовым фото.
3. Выберите формат и качество.
4. Запустите генерацию.`,

    [AiToolId.SEEDREAM]: `Seedream — генерация и редактирование изображений: реклама, product shots, персонажи, сложные композиции. Есть вывод в высоком разрешении.

Как пользоваться
1. Выберите качество.
2. Загрузите референс при необходимости.
3. Опишите результат.
4. Запустите генерацию.`,

    [AiToolId.FLUX]: `FLUX.2 Pro — реалистичные изображения для рекламы, fashion, сайтов и презентаций.

Как пользоваться
1. Выберите формат.
2. Добавьте фото или референс при необходимости.
3. Опишите результат и настройте качество.
4. Запустите генерацию.`,

    [AiToolId.SORA]: `Sora — видео по тексту и изображениям: реклама, анимация кадра, короткие ролики.

Как пользоваться
1. Опишите сцену.
2. При необходимости прикрепите фото-референсы.
3. Выберите формат, длительность и качество.
4. Запустите генерацию.`,

    [AiToolId.KLING]: `Kling — видео для рекламы, cinematic-сцен, product videos и соцсетей.

Как пользоваться
1. При необходимости загрузите фото или видео-референсы.
2. Опишите действие и движение камеры.
3. Выберите разрешение, длительность и стиль.
4. Запустите генерацию.`,

    [AiToolId.KLING_MOTION]: `Kling Motion — персонаж повторяет движение из видео.

Как пользоваться
1. Загрузите фото персонажа.
2. Загрузите видео с движением.
3. При желании прикрепите голос — то, что должен сказать аватар.
4. Опишите сцену и запустите генерацию.`,

    [AiToolId.VEO]: `Veo — cinematic-видео Google с нативным звуком.

Как пользоваться
1. Выберите формат, качество и длительность.
2. При необходимости прикрепите фото или видео-референсы.
3. Опишите движение и сцену.
4. Запустите генерацию.`,

    [AiToolId.HIGGSFIELD]: `Higgsfield — видео, анимация персонажей и реклама с готовыми эффектами камеры.

Как пользоваться
1. Добавьте изображение, если нужно.
2. Выберите формат, качество, длительность, стиль или эффект.
3. Опишите сцену или движение.
4. Запустите генерацию.`,

    [AiToolId.HEYGEN]: `HeyGen — видео с аватаром, который говорит ваш текст или голос.

Как пользоваться
1. Введите текст сценария или прикрепите голосовой файл озвучки.
2. Выберите формат, качество, голос и аватара.
3. Можно прикрепить фото — получится говорящий портрет.
4. В настройках HeyGen задайте субтитры, фон и выразительность.
5. Запустите генерацию.`,

    [AiToolId.TOPAZ]: `Topaz — не генератор, а улучшение уже готового фото или видео: резкость, шум, апскейл.

Как пользоваться
1. Загрузите фото или видео.
2. Выберите, во сколько раз улучшить качество.
3. Запустите обработку.`,

    [AiToolId.SEEDANCE]: `Seedance — видео по тексту, фото, видео и аудио. Можно редактировать и продолжать ролик.

Как пользоваться
1. Выберите формат и длительность (до 15 секунд).
2. При необходимости загрузите фото, одно видео и аудио-референс.
3. Опишите сцену и что должно произойти.
4. Запустите генерацию.`,

    [AiToolId.LUMA_RAY]: `Luma Ray — кинематографичное видео из текста и медиа, хорошо с движением камеры.

Как пользоваться
1. При необходимости загрузите фото или видео.
2. Видео + промпт — редактирование. Видео без промпта — смена формата кадра.
3. Опишите движение объекта и камеры.
4. Выберите формат, качество и длительность.`,

    [AiToolId.ELEVENLABS_VOICE]: `ElevenLabs — реалистичная озвучка текста.

Как пользоваться
1. Введите текст, который должен произнести ИИ.
2. Выберите голос (можно слушать превью).
3. Запустите генерацию.`,

    [AiToolId.VOICE_CLONE]: `Клонирование голоса — ИИ говорит новым текстом вашим голосом.

Как пользоваться
1. Загрузите голосовое или аудиофайл с образцом голоса.
2. Введите текст, который нужно произнести.
3. Запустите генерацию.`,

    [AiToolId.VIDEO_TO_AUDIO]: `Видео → аудио: озвучка ролика без звука (речь, атмосфера, эффекты).

Как пользоваться
1. Загрузите видео или аудио.
2. При желании укажите язык дубляжа (ru, en, es…).
3. Запустите генерацию.`,

    [AiToolId.SOUND_GENERATOR]: `Генератор звуков по описанию. Например: «дождь по металлической крыше ночью».

Как пользоваться
1. Опишите звук, а не сцену.
2. Укажите длительность.
3. Запустите генерацию.`,

    [AiToolId.SUNO]: `Suno — песни и инструментал по описанию, жанру и своему тексту.

Как пользоваться
1. Опишите идею или тему песни.
2. Напишите текст песни во втором поле, если нужен вокал.
3. Выберите длительность, жанр, настроение и инструментал.
4. Запустите генерацию.`,
};

const EN: Partial<Record<AiToolId, string>> = {
    [AiToolId.GPT]: `GPT — general assistant for text, ideas, files and images.

How to use
1. Describe the task.
2. More context means a more precise result.
3. Attach a file, photo or video if needed.
4. Keep chatting to refine the answer.`,

    [AiToolId.CLAUDE_SONNET]: `Claude — long documents, code and complex analysis.

How to use
1. State the task and add context.
2. Specify the answer format.
3. Attach a file, photo or video if needed.
4. Continue the dialogue to refine.`,

    [AiToolId.MIDJOURNEY]: `Midjourney — image generation and editing (V8.1).

How to use
1. Describe the image.
2. Attach a reference if needed.
3. Choose aspect ratio and style.
4. Run generation.`,

    [AiToolId.NANO_BANANA]: `Nano Banana — Google models for creating and editing photos from text.

How to use
1. Write what you want.
2. Upload a source or reference photo if needed.
3. Choose format and quality.
4. Run generation.`,

    [AiToolId.SEEDREAM]: `Seedream — ads, product shots, characters and complex compositions.

How to use
1. Choose quality.
2. Attach a reference if needed.
3. Describe the result.
4. Run generation.`,

    [AiToolId.FLUX]: `FLUX.2 Pro — realistic images for ads, fashion, sites and decks.

How to use
1. Choose format.
2. Add a photo or reference if needed.
3. Describe the result and set quality.
4. Run generation.`,

    [AiToolId.SORA]: `Sora — video from text and images.

How to use
1. Describe the scene.
2. Attach photo references if needed.
3. Choose format, duration and quality.
4. Run generation.`,

    [AiToolId.KLING]: `Kling — ads, cinematic scenes, product videos and social clips.

How to use
1. Attach photo or video references if needed.
2. Describe action and camera movement.
3. Choose resolution, duration and style.
4. Run generation.`,

    [AiToolId.KLING_MOTION]: `Kling Motion — a character repeats motion from a video.

How to use
1. Upload a character photo.
2. Upload a motion video.
3. Optionally attach a voice for the avatar to speak.
4. Describe the scene and run generation.`,

    [AiToolId.VEO]: `Veo — Google cinematic video with native audio.

How to use
1. Choose format, quality and duration.
2. Attach photo or video references if needed.
3. Describe motion and the scene.
4. Run generation.`,

    [AiToolId.HIGGSFIELD]: `Higgsfield — character animation and ads with camera effects.

How to use
1. Add an image if needed.
2. Choose format, quality, duration, style or effect.
3. Describe the scene or motion.
4. Run generation.`,

    [AiToolId.HEYGEN]: `HeyGen — an avatar speaks your script or voice file.

How to use
1. Enter a script or attach a speech audio file.
2. Choose format, quality, voice and avatar.
3. Attach a photo for a talking portrait.
4. Set captions, background and expressiveness in HeyGen options.
5. Run generation.`,

    [AiToolId.TOPAZ]: `Topaz — upscale and denoise an existing photo or video.

How to use
1. Upload a photo or video.
2. Choose the upscale factor.
3. Run processing.`,

    [AiToolId.SEEDANCE]: `Seedance — video from text, photos, video and audio (up to 15 seconds).

How to use
1. Choose format and duration.
2. Attach photos, one video and optional audio.
3. Describe what should happen.
4. Run generation.`,

    [AiToolId.LUMA_RAY]: `Luma Ray — cinematic video from text and media.

How to use
1. Attach a photo or video if needed.
2. Video + prompt = edit. Video without prompt = reframe.
3. Describe subject and camera motion.
4. Choose format, quality and duration.`,

    [AiToolId.ELEVENLABS_VOICE]: `ElevenLabs — realistic text-to-speech.

How to use
1. Enter the text to speak.
2. Pick a voice (you can preview it).
3. Run generation.`,

    [AiToolId.VOICE_CLONE]: `Voice clone — AI speaks new text in your voice.

How to use
1. Send a voice message or audio file as a sample.
2. Enter the text to speak.
3. Run generation.`,

    [AiToolId.VIDEO_TO_AUDIO]: `Video → audio: dub a clip (speech, ambience, effects).

How to use
1. Upload a video or audio file.
2. Optionally set the dubbing language (ru, en, es…).
3. Run generation.`,

    [AiToolId.SOUND_GENERATOR]: `Sound effects from a description. Example: “rain on a metal roof at night”.

How to use
1. Describe the sound, not the scene.
2. Set duration.
3. Run generation.`,

    [AiToolId.SUNO]: `Suno — songs and instrumentals from a description, genre and lyrics.

How to use
1. Describe the song idea.
2. Add lyrics in the second field if you want vocals.
3. Choose duration, genre, mood and instrumental.
4. Run generation.`,
};

export function getEditorGuideText(
    toolId: AiToolId,
    locale: 'ru-RU' | 'en-US',
): string | undefined {
    return (locale === 'en-US' ? EN : RU)[toolId];
}
