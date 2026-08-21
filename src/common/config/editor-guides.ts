import { AiToolId } from '@/common/services/ai/types';

const RU: Partial<Record<AiToolId, string>> = {
    [AiToolId.GPT]: `GPT — универсальный AI-помощник для работы с текстом, информацией, идеями, файлами, изображениями и сложными задачами.
Он может не просто отвечать на вопросы, а помогать создавать, анализировать, структурировать и улучшать информацию.

Что можно делать
• писать тексты, статьи, посты и сценарии
• придумывать идеи и концепции
• анализировать документы и файлы
• разбирать таблицы и данные
• писать и исправлять код
• создавать маркетинговые стратегии
• анализировать изображения
• составлять планы и инструкции
• проводить исследования
• переписывать и улучшать готовые тексты

Как пользоваться
1. Опишите задачу в поле ввода.
2. Чем подробнее контекст — тем точнее результат.
3. При необходимости прикрепите файл или изображение.
4. Отправьте запрос.
5. Если результат нужно изменить — продолжайте диалог и уточните, что именно изменить.`,

    [AiToolId.CLAUDE_SONNET]: `Claude — AI-помощник от Anthropic, особенно хорошо подходящий для анализа больших объёмов информации, сложных текстовых задач, документов, программирования и структурированной работы.

Что можно делать
• анализировать документы
• писать и редактировать тексты
• программировать
• анализировать код
• работать с большими объёмами информации
• структурировать исследования
• создавать стратегии
• анализировать данные
• работать с изображениями
• разбирать сложные задачи

Как пользоваться
1. Напишите задачу.
2. Добавьте контекст.
3. Укажите желаемый формат ответа.
4. Отправьте запрос.
5. Продолжайте диалог для уточнений.`,

    [AiToolId.GPT_IMAGES]: `Sora — AI для создания и редактирования изображений по текстовому описанию и референсам.
Модель генерирует изображения с нуля, редактирует существующие фото, поддерживает точный текст на изображениях и до 10 референсов для предсказуемого результата.

Что можно делать
• создавать изображения по описанию
• редактировать фотографии с референсами
• создавать рекламные креативы
• визуализировать продукты и персонажей
• получать вариации одного изображения
• работать с прозрачным фоном

Как пользоваться
1. Опишите задачу и при желании добавьте референсы.
2. Чем точнее вы укажете роль каждого изображения, тем предсказуемее результат.
3. Выберите формат и качество.
4. Запустите генерацию.`,

    [AiToolId.MIDJOURNEY]: `Midjourney — AI для создания и редактирования изображений. Он особенно хорошо подходит для визуальных концепций, рекламы, fashion, предметной съёмки, персонажей и художественных изображений.
Сейчас основной вариант — V8.1. Midjourney поддерживает Image Prompts, Style Reference, Omni Reference, Personalization, Raw Mode, изменение соотношения сторон и другие параметры.

Что можно делать
• создавать изображения с нуля
• делать рекламные креативы
• создавать fashion-съёмки
• визуализировать продукты
• создавать персонажей
• создавать концепты интерьеров и архитектуры
• переносить визуальный стиль референса
• использовать изображение человека или объекта как референс
• редактировать готовые изображения
• создавать серии изображений в едином стиле

Как пользоваться
1. Опишите изображение, которое хотите получить.
2. При необходимости загрузите референс.
3. Выберите соотношение сторон.
4. При необходимости настройте стиль, качество и степень стилизации.
5. Запустите генерацию.`,

    [AiToolId.NANO_BANANA]: `Nano Banana — семейство моделей Google для создания и редактирования изображений с помощью текста.
Главная особенность — возможность не только создать изображение с нуля, но и работать с существующими изображениями и референсами.

Что можно делать
• создавать изображения по описанию
• редактировать фотографии
• менять фон
• менять одежду
• добавлять или удалять объекты
• создавать рекламные креативы
• объединять несколько изображений
• создавать product shots
• работать с персонажами
• создавать вариации одного изображения

Как пользоваться
1. Напишите, что хотите получить.
2. Если работаете с существующим изображением — загрузите его.
3. Если хотите использовать референс — добавьте его.
4. Выберите нужное разрешение сторон фото для генерации.
5. Выберите качество фото.
6. Опишите изменения.
7. Запустите генерацию.`,

    [AiToolId.SEEDREAM]: `Seedream — модель ByteDance для генерации и редактирования изображений. Она подходит для рекламных креативов, коммерческой графики, product photography, персонажей и сложных визуальных композиций.
Seedream 5.0 также поддерживает вывод в 4K через ModelArk.

Что можно делать
• создавать изображения по тексту
• редактировать изображения
• работать с референсами
• создавать рекламные кампании
• генерировать продуктовые фотографии
• создавать fashion-креативы
• визуализировать продукты и упаковку
• создавать сложные композиции
• получать изображения высокого разрешения

Как пользоваться
1. Выберите качество/разрешение.
2. Загрузите референс, если он нужен.
3. Опишите результат.
4. Запустите генерацию.`,

    [AiToolId.FLUX]: `FLUX.2 Pro — профессиональная модель генерации изображений от Black Forest Labs.
Подходит прежде всего для реалистичных изображений, рекламы, коммерческой графики и сложных визуальных задач.

Что можно делать
• рекламные изображения
• продуктовые фотографии
• fashion
• lifestyle
• реалистичные персонажи
• концепты
• изображения для сайтов и презентаций
• вариации существующих изображений

Как пользоваться
1. Выберите формат.
2. Добавьте изображение или референс при необходимости.
3. Опишите желаемый результат.
4. Настройте разрешение/качество.
5. Запустите генерацию.`,

    [AiToolId.SORA]: `Sora — видео через OpenAI API (4, 8 или 12 секунд).
Подходит для рекламных роликов, анимации кадра и коротких сцен.

Что можно делать
• текст → видео
• одно фото как первый кадр
• редактирование видео по промпту
• продление готового ролика Sora
• персонажи из короткого видео (без лиц людей)

Ограничения
• длительность: 4, 8 или 12 секунд
• одно фото-референс
• лица людей на фото могут быть отклонены

Стоимость
• 4 сек — 600 кредитов
• 8 сек — 1 200 кредитов
• 12 сек — 1 800 кредитов
• качество «высокое» — ×1.5

Как пользоваться
1. Опишите сцену.
2. При необходимости загрузите одно фото или видео для редактирования.
3. Выберите формат, разрешение, длительность и качество.
4. Запустите генерацию.

Продлить видео: под готовым роликом нажмите «Продлить видео», опишите продолжение сцены и запустите генерацию. Стоимость продления — от 600 кредитов (4 сек).`,

    [AiToolId.KLING]: `Kling 3.0 — AI для генерации видео.
Он подходит для создания рекламных роликов, cinematic-видео, product videos, персонажей, сцен с движением камеры и анимации изображений.

Что можно делать
• текст → видео
• изображение → видео
• создавать рекламные ролики
• оживлять изображения
• создавать кинемотографичные сцены
• генерировать движения камеры
• создавать рекламные кампании для fashion-брендов и видеокампании
• создавать ролики для TikTok, Reels и Shorts

Как пользоваться
1. При необходимости загрузите изображение.
2. Опишите действие и движение.
3. Выберите разрешение/длительность/качество/стиль генерации.
4. Запустите генерацию.`,

    [AiToolId.VEO]: `Veo — AI-модель Google для генерации видео.
Она особенно полезна для cinematic-сцен, рекламы, storytelling и коротких реалистичных видеороликов.
Veo 3.1 поддерживает 8-секундную генерацию, 720p/1080p/4K, portrait 9:16, extension, first/last frame и до трёх reference images; также поддерживает нативно генерируемый звук.

Что можно делать
• рекламные ролики
• кадры из фильма
• изображение → видео
• атмосферные сцены
• продуктовые видео
• рассказ
• контент для соц.сетей
• видео с синхронным аудио

Как пользоваться
1. Выберите формат.
2. Выберите качество/хронометраж генерации.
3. Загрузите изображение, если хотите анимировать его.
4. Добавьте до доступного количества референсов.
5. Опишите движение и сцену.
6. Запустите генерацию.`,

    [AiToolId.HIGGSFIELD]: `Higgsfield — AI-платформа для создания и обработки визуального контента, особенно видео.
Она объединяет инструменты для генерации видео, анимации персонажей, camera control, рекламы и social media content.

Что можно делать
• создавать AI-видео
• оживлять изображения
• создавать рекламные ролики
• работать с персонажами
• создавать fashion-контент
• использовать движения камеры
• создавать видео для соц.сетей
• превращать изображения в динамические сцены

Как пользоваться
1. Добавьте изображение или видео, если это необходимо.
2. Выберите формат/качество/хронометраж/стиль/эффект генерации.
3. Опишите сцену или движение.
4. Запустите генерацию.`,

    [AiToolId.HEYGEN]: `HeyGen — AI-платформа для создания видео с виртуальными ведущими и цифровыми аватарами.
Главная задача — превратить текст, голос или изображение в видео, где AI-персонаж говорит и ведёт себя как человек.

Что можно делать
• создавать AI-аватара
• создавать рекламные видео
• делать презентации
• создавать обучающие ролики
• делать видео для соцсетей
• переводить видео
• создавать цифровую копию человека
• синхронизировать движения губ с речью
• использовать собственный голос
• создавать видео на разных языках

Как пользоваться
1. Введите текст сценария.
2. Выберите формат видео.
3. Выберите качество.
4. Выберите голос и аватара.
5. Далее в разделе настроек кнопка «HeyGen» под чатом настройте нужные для вас параметры.
6. Запустите генерацию.`,

    [AiToolId.TOPAZ]: `Topaz — набор AI-инструментов для улучшения качества уже существующих изображений и видео.
Это не генератор в классическом смысле. Его основная задача — взять исходный материал и сделать его чётче, чище и качественнее.
Topaz Photo сейчас включает, среди прочего, Upscale, Denoise, Sharpen, Recover Faces, Remove и другие инструменты; Topaz Video работает с upscale, frame interpolation, stabilization, HDR и denoise.

Что можно делать
Видео:
• повышать разрешение
• стабилизировать видео
• интерполировать кадры
• уменьшать шум
• улучшать детализацию
Изображения:
• увеличивать разрешение
• повышать резкость
• удалять шум
• восстанавливать лица
• улучшать старые фотографии
• удалять артефакты

Как пользоваться
1. Загрузите фото или видео.
2. Выберите, во сколько раз улучшить качество.
3. Запустите обработку.`,

    [AiToolId.SEEDANCE]: `Seedance — AI-модель ByteDance для генерации и редактирования видео.
Она особенно интересна для сложных мультимодальных сцен, где нужно использовать изображения, видео, аудио и текстовые инструкции одновременно.
Seedance поддерживает до 30 фото, 10 видео и 10 аудио-референсов, генерацию до 30 секунд, редактирование и extension видео (480p / 720p).

Что можно делать
• текст → видео
• изображение → видео
• редактировать видео
• продолжать существующий ролик
• использовать несколько референсов (фото, видео, аудио)
• создавать рекламные ролики
• синхронизировать видео с аудио
• создавать сложные cinematic-сцены длиной до 30 секунд

Как пользоваться
1. Выберите формат и длительность (4–30 сек).
2. Загрузите изображения/видео/аудио при необходимости.
3. Опишите сцену.
4. Укажите, что должно измениться или произойти.
5. Выберите разрешение (480p / 720p) и запустите генерацию.`,

    [AiToolId.LUMA_RAY]: `Luma Ray — AI-модель для создания реалистичных и кинематографичных видео из текста и изображений.
С её помощью можно оживлять статичные изображения, создавать динамичные сцены, рекламные ролики, cinematic-видео и визуальный контент для социальных сетей. Модель хорошо подходит для работы с движением камеры, атмосферой, светом и реалистичной физикой объектов.

Что можно делать
• изображение → видео
• создание движения из изображения
• кинемотографичные видео
• движение камеры
• рекламные сцены
• визуальные эффекты
• анимация персонажей
• короткие видео для соц.сетей

Как пользоваться
1. При необходимости загрузите изображение начального кадра (с какого кадра начинается сцена) и конечного кадра (в какой должна перетечь сцена).
2. Опишите движение объекта.
3. Опишите движение камеры.
4. Выберите формат видео.
5. Выберите качество/длительность/стиль.
6. Запустите генерацию.`,

    [AiToolId.ELEVENLABS_VOICE]: `ElevenLabs — AI-платформа для работы с голосом и аудио.
Она позволяет превращать текст в реалистичную речь, создавать голоса, изменять голос, транскрибировать аудио и генерировать музыку и звуковые эффекты.

Что можно делать
• озвучивать тексты
• создавать закадровую озвучку
• выбирать AI-голоса
• менять голос
• создавать диалоги
• делать озвучку для видео
• создавать аудиокниги
• создавать подкасты
• транскрибировать аудио

Как пользоваться
1. Введите текст, который будет произносить ИИ.
2. Выберите голос.
3. Запустите генерацию.`,

    [AiToolId.VOICE_CLONE]: `Инструмент позволяет создать цифровую копию голоса на основе аудиозаписи.
После создания клона AI может произносить новый текст голосом, похожим на исходный, даже если человек никогда не записывал эти слова. ElevenLabs поддерживает Instant и Professional Voice Cloning.

Как пользоваться
1. Загрузите образец голоса или выберите из предложенных.
2. Введите текст, который должен быть произнесён.
3. Запустите генерацию.`,

    [AiToolId.VIDEO_TO_AUDIO]: `Инструмент превращает видео без звука в полноценную озвученную сцену.
AI анализирует происходящее и позволяет создать подходящий аудиослой: речь, атмосферу, эффекты или другие звуки.

Что можно сделать
• озвучить происходящее
• создать звуки объектов
• создать озвучку эффектов для короткометражек

Как пользоваться
1. Загрузите видео.
2. Запустите генерацию.`,

    [AiToolId.SOUND_GENERATOR]: `AI для создания звуковых эффектов по текстовому описанию.
Например:
«Звук дождя по металлической крыше ночью».
Или:
«Futuristic spaceship engine starting, deep mechanical hum, cinematic».
ElevenLabs поддерживает генерацию SFX из текста, настройку длительности и looping.

Что можно создавать
• звуки природы
• Foley
• UI sounds
• кинемотографичные эффекты
• звуки транспорта
• механические звуки
• переходы
• игровые эффекты
• атмосферу для видео

Как пользоваться
1. Опишите звук.
2. Укажите желаемую длительность.
3. Запустите генерацию.`,

    [AiToolId.SUNO]: `Suno — AI для создания полноценных музыкальных композиций и песен.
Можно создавать музыку по текстовому описанию, задавать стиль, жанр, настроение и собственный текст. Официальный Suno API предназначен для генерации песен, covers и mashups.

Что можно делать
• создавать песни
• создавать инструментальную музыку
• писать музыку под видео
• создавать рекламные джинглы
• делать фоновые треки
• создавать музыку определённого жанра
• использовать собственный текст
• создавать каверы и mashups там, где это поддерживается

Как пользоваться
1. Опишите идею или тему песни в первом разделе чата.
2. Напишите текст для музыки во втором разделе чата.
3. Выберите нужный хронометраж.
4. Выберите жанр, настроение и инструментал.
5. Запустите генерацию.`,
};

const EN: Partial<Record<AiToolId, string>> = {
    [AiToolId.GPT]: `GPT is a universal AI assistant for working with text, information, ideas, files, images and complex tasks.
It does more than answer questions — it helps create, analyze, structure and improve information.

What you can do
• write texts, articles, posts and scripts
• come up with ideas and concepts
• analyze documents and files
• parse tables and data
• write and fix code
• create marketing strategies
• analyze images
• build plans and instructions
• conduct research
• rewrite and improve existing texts

How to use
1. Describe your task in the input field.
2. The more context you provide, the more accurate the result.
3. Attach a file or image if needed.
4. Send the request.
5. To refine the result, continue the dialogue and specify what to change.`,

    [AiToolId.CLAUDE_SONNET]: `Claude is an AI assistant from Anthropic, especially suited for analyzing large volumes of information, complex text tasks, documents, programming and structured work.

What you can do
• analyze documents
• write and edit texts
• program
• analyze code
• work with large volumes of information
• structure research
• create strategies
• analyze data
• work with images
• break down complex tasks

How to use
1. Write your task.
2. Add context.
3. Specify the desired answer format.
4. Send the request.
5. Continue the dialogue to refine.`,

    [AiToolId.GPT_IMAGES]: `Sora is an AI for creating and editing images from text descriptions and references.
The model generates images from scratch, edits existing photos, supports accurate text on images and up to 10 references for predictable results.

What you can do
• create images from a description
• edit photos with references
• create ad creatives
• visualize products and characters
• get variations of one image
• work with transparent backgrounds

How to use
1. Describe the task and attach references if needed.
2. The more precisely you specify each image's role, the more predictable the result.
3. Choose format and quality.
4. Run generation.`,

    [AiToolId.MIDJOURNEY]: `Midjourney is an AI for creating and editing images. It excels at visual concepts, ads, fashion, product photography, characters and artistic images.
The main version now is V8.1. Midjourney supports Image Prompts, Style Reference, Omni Reference, Personalization, Raw Mode, aspect ratio changes and other parameters.

What you can do
• create images from scratch
• make ad creatives
• create fashion shoots
• visualize products
• create characters
• create interior and architecture concepts
• transfer a reference's visual style
• use a person or object image as a reference
• edit finished images
• create image series in a unified style

How to use
1. Describe the image you want.
2. Upload a reference if needed.
3. Choose aspect ratio.
4. Adjust style, quality and stylization if needed.
5. Run generation.`,

    [AiToolId.NANO_BANANA]: `Nano Banana is a family of Google models for creating and editing images with text.
The key feature is the ability not only to create an image from scratch, but also to work with existing images and references.

What you can do
• create images from a description
• edit photos
• change backgrounds
• change clothing
• add or remove objects
• create ad creatives
• combine several images
• create product shots
• work with characters
• create variations of one image

How to use
1. Write what you want to get.
2. If working with an existing image — upload it.
3. If you want a reference — add it.
4. Choose the desired photo resolution for generation.
5. Choose photo quality.
6. Describe the changes.
7. Run generation.`,

    [AiToolId.SEEDREAM]: `Seedream is a ByteDance model for generating and editing images. It suits ad creatives, commercial graphics, product photography, characters and complex visual compositions.
Seedream 5.0 also supports 4K output via ModelArk.

What you can do
• create images from text
• edit images
• work with references
• create ad campaigns
• generate product photos
• create fashion creatives
• visualize products and packaging
• create complex compositions
• get high-resolution images

How to use
1. Choose quality/resolution.
2. Upload a reference if needed.
3. Describe the result.
4. Run generation.`,

    [AiToolId.FLUX]: `FLUX.2 Pro is a professional image generation model from Black Forest Labs.
It is best suited for realistic images, ads, commercial graphics and complex visual tasks.

What you can do
• ad images
• product photos
• fashion
• lifestyle
• realistic characters
• concepts
• images for sites and presentations
• variations of existing images

How to use
1. Choose format.
2. Add an image or reference if needed.
3. Describe the desired result.
4. Set resolution/quality.
5. Run generation.`,

    [AiToolId.SORA]: `Sora — OpenAI video API (4, 8, or 12 seconds).
Suitable for ad clips, frame animation, and short scenes.

What you can do
• text → video
• one photo as the first frame
• edit video with a prompt
• extend a completed Sora clip
• characters from short video clips (no human faces)

Limits
• duration: 4, 8, or 12 seconds
• one photo reference
• human faces in photos may be rejected

Cost
• 4 sec — 600 credits
• 8 sec — 1,200 credits
• 12 sec — 1,800 credits
• "high" quality — ×1.5

How to use
1. Describe the scene.
2. Optionally upload one photo or a video to edit.
3. Choose format, resolution, duration, and quality.
4. Run generation.

Extend video: tap "Extend video" under a finished clip, describe how the scene should continue, and generate again. Extension costs from 600 credits (4 sec).`,

    [AiToolId.KLING]: `Kling 3.0 is an AI for video generation.
It suits ad clips, cinematic video, product videos, characters, camera movement scenes and image animation.

What you can do
• text → video
• image → video
• create ad clips
• animate images
• create cinematic scenes
• generate camera movements
• create ad campaigns for fashion brands and video campaigns
• create clips for TikTok, Reels and Shorts

How to use
1. Upload an image if needed.
2. Describe the action and movement.
3. Choose resolution/duration/quality/generation style.
4. Run generation.`,

    [AiToolId.VEO]: `Veo is Google's AI model for video generation.
It is especially useful for cinematic scenes, ads, storytelling and short realistic clips.
Veo 3.1 supports 8-second generation, 720p/1080p/4K, portrait 9:16, extension, first/last frame and up to three reference images; it also supports natively generated audio.

What you can do
• ad clips
• film-like shots
• image → video
• atmospheric scenes
• product videos
• storytelling
• social media content
• video with synchronized audio

How to use
1. Choose format.
2. Choose quality/duration for generation.
3. Upload an image if you want to animate it.
4. Add up to the available number of references.
5. Describe motion and the scene.
6. Run generation.`,

    [AiToolId.HIGGSFIELD]: `Higgsfield is an AI platform for creating and processing visual content, especially video.
It combines tools for video generation, character animation, camera control, ads and social media content.

What you can do
• create AI video
• animate images
• create ad clips
• work with characters
• create fashion content
• use camera movements
• create videos for social media
• turn images into dynamic scenes

How to use
1. Add an image or video if needed.
2. Choose format/quality/duration/style/effect for generation.
3. Describe the scene or motion.
4. Run generation.`,

    [AiToolId.HEYGEN]: `HeyGen is an AI platform for creating video with virtual hosts and digital avatars.
The main goal is to turn text, voice or an image into video where an AI character speaks and behaves like a person.

What you can do
• create an AI avatar
• create ad videos
• make presentations
• create training clips
• make videos for social media
• translate video
• create a digital copy of a person
• sync lip movements with speech
• use your own voice
• create videos in different languages

How to use
1. Enter the script text.
2. Choose video format.
3. Choose quality.
4. Choose voice and avatar.
5. In HeyGen settings under the chat, configure the parameters you need.
6. Run generation.`,

    [AiToolId.TOPAZ]: `Topaz is a set of AI tools for improving the quality of existing images and video.
It is not a generator in the classic sense. Its main job is to take source material and make it sharper, cleaner and higher quality.
Topaz Photo includes Upscale, Denoise, Sharpen, Recover Faces, Remove and other tools; Topaz Video handles upscale, frame interpolation, stabilization, HDR and denoise.

What you can do
Video:
• increase resolution
• stabilize video
• interpolate frames
• reduce noise
• improve detail
Images:
• increase resolution
• sharpen
• remove noise
• restore faces
• improve old photos
• remove artifacts

How to use
1. Upload a photo or video.
2. Choose how many times to upscale quality.
3. Run processing.`,

    [AiToolId.SEEDANCE]: `Seedance is ByteDance's AI model for generating and editing video.
It is especially interesting for complex multimodal scenes that use images, video, audio and text instructions at once.
Seedance supports up to 30 images, 10 videos and 10 audio references, generation up to 30 seconds, editing and video extension (480p / 720p).

What you can do
• text → video
• image → video
• edit video
• continue an existing clip
• use multiple references (photo, video, audio)
• create ad clips
• sync video with audio
• create complex cinematic scenes up to 30 seconds

How to use
1. Choose format and duration (4–30 sec).
2. Upload images/video/audio if needed.
3. Describe the scene.
4. Specify what should change or happen.
5. Choose resolution (480p / 720p) and run generation.`,

    [AiToolId.LUMA_RAY]: `Luma Ray is an AI model for creating realistic and cinematic video from text and images.
It can animate static images, create dynamic scenes, ad clips, cinematic video and visual content for social media. The model works well with camera movement, atmosphere, light and realistic object physics.

What you can do
• image → video
• create motion from an image
• cinematic video
• camera movement
• ad scenes
• visual effects
• character animation
• short videos for social media

How to use
1. If needed, upload a start frame (where the scene begins) and end frame (where it should transition).
2. Describe object motion.
3. Describe camera motion.
4. Choose video format.
5. Choose quality/duration/style.
6. Run generation.`,

    [AiToolId.ELEVENLABS_VOICE]: `ElevenLabs is an AI platform for voice and audio.
It turns text into realistic speech, creates voices, changes voice, transcribes audio and generates music and sound effects.

What you can do
• voice texts
• create voice-over
• choose AI voices
• change voice
• create dialogues
• voice video
• create audiobooks
• create podcasts
• transcribe audio

How to use
1. Enter the text the AI should speak.
2. Choose a voice.
3. Run generation.`,

    [AiToolId.VOICE_CLONE]: `This tool creates a digital copy of a voice from an audio recording.
After cloning, AI can speak new text in a voice similar to the original, even if the person never recorded those words. ElevenLabs supports Instant and Professional Voice Cloning.

How to use
1. Upload a voice sample or choose from offered ones.
2. Enter the text to be spoken.
3. Run generation.`,

    [AiToolId.VIDEO_TO_AUDIO]: `This tool turns a silent video into a fully voiced scene.
AI analyzes what happens and lets you create a suitable audio layer: speech, atmosphere, effects or other sounds.

What you can do
• voice what is happening
• create object sounds
• create effect audio for short films

How to use
1. Upload a video.
2. Run generation.`,

    [AiToolId.SOUND_GENERATOR]: `AI for creating sound effects from a text description.
For example:
"Rain on a metal roof at night."
Or:
"Futuristic spaceship engine starting, deep mechanical hum, cinematic."
ElevenLabs supports SFX generation from text, duration settings and looping.

What you can create
• nature sounds
• Foley
• UI sounds
• cinematic effects
• transport sounds
• mechanical sounds
• transitions
• game effects
• atmosphere for video

How to use
1. Describe the sound.
2. Set the desired duration.
3. Run generation.`,

    [AiToolId.SUNO]: `Suno is an AI for creating full musical compositions and songs.
You can create music from a text description, set style, genre, mood and your own lyrics. The official Suno API is for generating songs, covers and mashups.

What you can do
• create songs
• create instrumental music
• write music for video
• create ad jingles
• make background tracks
• create music in a specific genre
• use your own lyrics
• create covers and mashups where supported

How to use
1. Describe the song idea or theme in the first chat section.
2. Write lyrics in the second chat section.
3. Choose duration.
4. Choose genre, mood and instrumental.
5. Run generation.`,
};

export function getEditorGuideText(
    toolId: AiToolId,
    locale: 'ru-RU' | 'en-US',
): string | undefined {
    return (locale === 'en-US' ? EN : RU)[toolId];
}
