import { AiToolId } from '@/common/services/ai/types';

const RU: Partial<Record<AiToolId, string>> = {
    [AiToolId.GPT]: `🤖 GPT
Умный помощник в чате — отвечает на вопросы и помогает с любыми задачами.

- ✍️ Напиши текст, пост, письмо или сценарий — GPT поможет создать или улучшить
- 💡 Объяснит сложное простыми словами
- 📄 Разберёт документ, таблицу или код
- 📷 Посмотрит на фото и расскажет, что на нём
- 🔄 Продолжай диалог — «сделай короче», «перепиши мягче» и другие правки

Как пользоваться
1. Напиши задачу своими словами.
2. Чем подробнее — тем лучше ответ.
3. При желании прикрепи файл или фото.
4. Отправь.
5. Нужно поправить? Просто напиши, что изменить — GPT продолжит диалог.`,

    [AiToolId.CLAUDE_SONNET]: `🧠 Claude Sonnet
Умный помощник в чате — особенно удобен для длинных текстов и сложных разборов.

- 📚 Хорошо читает большие документы
- ✍️ Помогает писать и править тексты
- 💻 Разбирает код и сложные задачи
- 📎 Можно прикрепить файл или фото
- 🎯 Отвечает спокойно и по делу

Как пользоваться
1. Напиши, что нужно.
2. Добавь файл или фото, если они важны.
3. Скажи, в каком виде хочешь ответ (список, план, коротко).
4. Отправь.
5. Нужно уточнить? Просто продолжай диалог в чате.`,

    [AiToolId.GPT_IMAGES]: `🖼️ Sora
Создавай и редактируй изображения по тексту с помощью Sora.

- ✍️ Опиши идею — Sora создаст новую картинку
- 📸 Добавь до 10 фото в качестве примеров или референсов
- 🔤 Хорошо пишет текст на картинке (вывески, надписи)
- 📐 Выбери качество: 1K, 2K или 4K

Как пользоваться
1. Опиши, что нужно на картинке.
2. При желании добавь фото-примеры.
3. Выбери формат и качество.
4. Запусти генерацию.
5. Не понравился результат? Опиши, что изменить, и запусти снова.`,

    [AiToolId.MIDJOURNEY]: `🎨 Midjourney
Рисует картинки по описанию — сначала показывает сетку из 4 вариантов.

- ✍️ Опиши, что хочешь увидеть — получишь 4 картинки сразу
- 📸 Можно прикрепить до 10 фото-референсов
- 📐 Качество: 720p, 1080p или 4K

Как пользоваться
1. Опиши картинку простыми словами.
2. При необходимости прикрепи фото.
3. Выбери формат и качество.
4. Запусти генерацию и подожди сетку.
5. Нажми #1, #2, #3 или #4 — выбери один кадр.`,

    [AiToolId.NANO_BANANA]: `🍌 Nano Banana
Создавай и редактируй изображения с помощью Nano Banana.

- ✍️ Опиши идею словами — Nano Banana создаст изображение по твоему запросу
- 📸 Добавь своё фото — можно изменить изображение, заменить детали или полностью преобразовать его
- 🖼️ Добавь до 14 изображений в качестве примеров или референсов
- 🎥 Прикрепи короткое видео — модель поймёт его содержание и создаст изображение на его основе
- 📐 Выбери разрешение: 512p, 1K, 2K или 4K
- 🌐 Поиск в интернете включён автоматически — Nano Banana может использовать актуальную информацию, например новости, погоду, логотипы и другие данные
- 🔄 Продолжай редактирование — после генерации просто напиши, что нужно изменить. Если не добавлять новые файлы, модель продолжит работать с предыдущим изображением

Как пользоваться
1. Напиши, что хочешь создать или изменить.
2. При необходимости нажми «Добавить фото/видео» и прикрепи файлы.
3. Выбери формат и разрешение изображения.
4. Запусти генерацию.
5. Не понравился результат? Просто напиши, что нужно изменить — Nano Banana продолжит редактирование.`,

    [AiToolId.SEEDREAM]: `🌱 Seedream
Создавай и редактируй изображения — удобна для рекламы, товаров и красивых фото.

- ✍️ Опиши идею — Seedream создаст картинку по тексту
- 📸 Добавь своё фото — можно изменить или доработать изображение
- 🖼️ Прикрепи примеры для более точного результата
- 📐 Выбери качество: 2K или 4K

Как пользоваться
1. Выбери качество картинки.
2. При желании добавь своё фото или примеры.
3. Напиши, что хочешь получить.
4. Запусти генерацию.`,

    [AiToolId.FLUX]: `⚡ Flux
Делает реалистичные картинки и умеет несколько режимов под разные задачи.

- 🎨 «Генерация» — обычная картинка по тексту (можно с фото)
- 🔍 «Резкость» — сделать размытое фото чётче (текст не нужен)
- ✂️ «Удалить» — убрать объект: нужно фото + маска (чёрным закрась лишнее)
- 👗 «Примерка» — человек + фото одежды
- 🖼️ «Расширить» — добавить место вокруг фото
- 📐 Можно выбрать формат и качество

Как пользоваться
1. Выбери режим.
2. Добавь нужные фото (кнопка подскажет, какие).
3. Если режим просит — напиши текст.
4. Выбери качество и запусти генерацию.`,

    [AiToolId.SORA]: `🎬 Sora
Создавай короткие видео по тексту с помощью Sora.

- ✍️ Опиши сцену — получишь ролик на 4, 8 или 12 секунд
- 📸 Прикрепи одно фото — видео начнётся с него
- 🆕 «Создать» — новое видео с нуля
- ⏩ «Продлить» — продолжить уже готовый ролик Sora
- ✏️ «Редактировать» — изменить готовое видео по тексту
- 🎭 Можно добавить персонажей из короткого клипа (без лиц людей)
- ⚠️ Лица людей на фото иногда отклоняются

Сколько стоит примерно
- 4 сек — 600 кредитов
- 8 сек — 1 200
- 12 сек — 1 800
- 1080p (Pro) дороже в 1.5 раза

Как пользоваться
1. Выбери режим: создать, продлить или редактировать.
2. Напиши, что происходит в сцене.
3. При желании добавь одно фото или готовое видео.
4. Выбери формат, разрешение и длительность.
5. Запусти и подожди. Чтобы продлить — нажми «Продлить видео» под готовым роликом.`,

    [AiToolId.KLING]: `🎥 Kling
Создавай короткие видео по тексту или фото с помощью Kling.

- ✍️ Опиши сцену — получишь видео
- 📸 1 фото — видео начнётся с него
- 🔄 2 фото — плавный переход от первого кадра ко второму
- 🖼️ До 4 фото — несколько примеров сразу
- 📐 Разрешение: 720p или 1080p (1080p дороже)
- 🔊 «Звук: вкл» — модель сама добавит звук
- 🚫 Поле «Чего не должно быть» — напиши, чего избегать

Как пользоваться
1. При желании добавь до 4 фото.
2. Напиши, что происходит в ролике.
3. Выбери формат, длительность, 720p/1080p и звук.
4. Запусти генерацию.`,

    [AiToolId.KLING_MOTION]: `💃 Kling Motion
Переносит движение из видео на человека с фото.

- 📸 Нужно фото человека и короткое видео с движением
- 🕺 Человек на фото начнёт двигаться как в видео
- ⏱️ «Поза с фото» — короткие клипы (до ~10 сек)
- 🎞️ «Поза из видео» — можно подлиннее (до ~30 сек)
- 🔊 Можно оставить звук с видео движения
- 📐 Разрешение: 720p или 1080p

Как пользоваться
1. Загрузи фото персонажа.
2. Загрузи видео с движением.
3. Выбери позу и разрешение.
4. При желании допиши описание сцены.
5. Запусти генерацию.`,

    [AiToolId.VEO]: `🌟 Veo
Создавай короткие видео по тексту — звук в ролике уже есть сам по себе.

- ✍️ Опиши сцену — получишь видео на 4, 6 или 8 секунд
- 📐 Формат: широкий (16:9) или вертикальный сторис (9:16)
- 🎞️ Качество: 720p, 1080p или 4K
- 📸 Одно фото — видео начнётся с этого кадра
- 🔄 Два фото — плавный переход от первого ко второму
- 🖼️ До 3 фото-примеров — «как должно выглядеть»
- 🆕 «Новое видео» — с нуля
- ⏩ «Продолжить +7 сек» — дописать ещё 7 секунд к прошлому ролику Veo
- 🚫 Поле «Чего не должно быть» — напиши, чего избегать

Как пользоваться
1. Выбери «Новое видео» или «Продолжить +7 сек».
2. Выбери формат и качество.
3. При желании прикрепи фото или прошлое видео.
4. Напиши, что происходит в ролике.
5. Запусти генерацию и подожди.`,

    [AiToolId.HIGGSFIELD]: `🎞️ Higgsfield
Создавай видео с красивым движением камеры — как снято режиссёром.

- 📸 Можно оживить фото
- 🎥 Можно выбрать эффект или движение камеры
- 📱 Подходит для рекламы и соцсетей
- ✍️ Опиши сцену — модель снимет «как режиссёр»

Как пользоваться
1. При желании добавь фото.
2. Выбери формат, длительность и эффект.
3. Напиши, что должно происходить.
4. Запусти генерацию.`,

    [AiToolId.HEYGEN]: `🗣️ HeyGen
Создавай видео с виртуальным ведущим — аватар произносит твой текст.

- ✍️ Пишешь текст — аватар произносит его в видео
- 👤 Можно выбрать лицо (аватар) и голос
- 📸 Можно загрузить своё фото — получится «говорящая голова»
- 📢 Удобно для рекламы, обучения и объясняющих роликов

Как пользоваться
1. Впиши текст, который должен сказать ведущий.
2. Выбери аватар и голос.
3. Выбери формат и настройки в кнопке «HeyGen».
4. Запусти генерацию.`,

    [AiToolId.TOPAZ]: `✨ Topaz
Не рисует новое — улучшает уже готовое фото или видео.

- 🔍 Делает картинку или видео чётче и чище
- 📐 Можно увеличить размер (×2, ×4, ×6)
- 🎞️ Подходит, если ролик мыльный или мелкий

Как пользоваться
1. Загрузи фото или видео.
2. Выбери, во сколько раз улучшить.
3. Запусти обработку и подожди.`,

    [AiToolId.SEEDANCE]: `🌊 Seedance
Создавай видео и опирайся сразу на много файлов — текст, фото, видео и звук.

- 📎 Можно дать текст + фото + видео + звук вместе
- ⏱️ Ролики до 30 секунд
- ⏩ Можно продолжить уже готовое видео
- 🖼️ Много примеров сразу (десятки фото, несколько видео и аудио)

Как пользоваться
1. Выбери формат и длительность.
2. При желании добавь фото, видео или звук.
3. Напиши, что должно получиться.
4. Выбери качество и запусти.`,

    [AiToolId.LUMA_RAY]: `🎥 Luma Ray
Оживляет картинку в короткое кинематографичное видео.

- 📸 Можно начать с одного фото
- 🔄 Можно задать начало и конец (два кадра)
- 🎬 Хорошо получается движение камеры и атмосфера
- ✍️ Опиши, куда едет камера и что делает объект

Как пользоваться
1. При желании добавь фото начала (и конца).
2. Напиши движение объекта и камеры.
3. Выбери формат, длительность и стиль.
4. Запусти генерацию.`,

    [AiToolId.ELEVENLABS_VOICE]: `🎙️ ElevenLabs
Превращает написанный текст в речь — выбери голос и озвучь.

- ✍️ Пишешь текст — получаешь голос, который его читает
- 🗣️ Можно выбрать разных дикторов
- 🎬 Подходит для роликов, озвучки и подкастов

Как пользоваться
1. Впиши текст.
2. Выбери голос.
3. Запусти генерацию.`,

    [AiToolId.VOICE_CLONE]: `🎤 Клон голоса
Учится на короткой записи и потом говорит твоим голосом.

- 📎 Загружаешь образец голоса
- ✍️ Пишешь любой новый текст
- 🔊 Получаешь озвучку «как будто это сказал тот же человек»

Как пользоваться
1. Загрузи короткую чистую запись голоса.
2. Впиши текст.
3. Запусти генерацию.`,

    [AiToolId.VIDEO_TO_AUDIO]: `🔊 Озвучка к видео
Добавляет озвучку к ролику без нормальной аудиодорожки.

- 🎬 Загружаешь видео — модель делает подходящую озвучку или звуковой слой
- 🌍 Можно указать язык (или оставить русский)

Как пользоваться
1. Загрузи видео.
2. При желании укажи язык.
3. Запусти генерацию.`,

    [AiToolId.SOUND_GENERATOR]: `🔔 Генерация звуков
Создаёт звуковой эффект по описанию.

- ✍️ Напиши звук словами — получишь аудиофайл
- 💡 Примеры: «дождь по крыше», «шаги по снегу», «дверь скрипит»
- ⏱️ Можно выбрать длительность

Как пользоваться
1. Опиши звук как слышишь его в голове.
2. Выбери длительность.
3. Запусти генерацию.`,

    [AiToolId.SUNO]: `🎵 Suno
Создавай готовую песню или музыку — без инструментов и студии.

- ✍️ Опиши идею песни — получишь трек
- 🎸 Можно задать жанр и настроение
- 📝 Можно написать свой текст куплетов
- 🎹 Можно сделать просто музыку без слов (инструментал)

Как пользоваться
1. Опиши тему или идею песни.
2. При желании впиши свой текст.
3. Выбери жанр, настроение и длительность.
4. Запусти генерацию.`,
};

const EN: Partial<Record<AiToolId, string>> = {
    [AiToolId.GPT]: `🤖 GPT
A smart chat assistant — answers questions and helps with any task.

- ✍️ Write a text, post, email or script — GPT will help create or improve it
- 💡 Explains complex things in simple words
- 📄 Parses documents, spreadsheets or code
- 📷 Looks at a photo and tells you what's in it
- 🔄 Continue the dialogue — "make it shorter", "rewrite more gently" and other edits

How to use
1. Describe your task in your own words.
2. The more detail you provide, the better the answer.
3. Optionally attach a file or photo.
4. Send.
5. Need changes? Just say what to fix — GPT will continue the conversation.`,

    [AiToolId.CLAUDE_SONNET]: `🧠 Claude Sonnet
A smart chat assistant — especially good for long texts and complex analysis.

- 📚 Reads large documents well
- ✍️ Helps write and edit texts
- 💻 Breaks down code and complex tasks
- 📎 You can attach a file or photo
- 🎯 Responds calmly and to the point

How to use
1. Write what you need.
2. Add a file or photo if they matter.
3. Say what format you want (list, plan, brief).
4. Send.
5. Need to clarify? Just continue the chat.`,

    [AiToolId.GPT_IMAGES]: `🖼️ Sora
Create and edit images from text with Sora.

- ✍️ Describe your idea — Sora will create a new image
- 📸 Add up to 10 photos as examples or references
- 🔤 Great at text on images (signs, labels)
- 📐 Choose quality: 1K, 2K or 4K

How to use
1. Describe what should be in the image.
2. Optionally add photo references.
3. Choose format and quality.
4. Run generation.
5. Not happy with the result? Describe what to change and run again.`,

    [AiToolId.MIDJOURNEY]: `🎨 Midjourney
Draws images from descriptions — first shows a grid of 4 variants.

- ✍️ Describe what you want to see — get 4 images at once
- 📸 Add up to 10 photo references — the model will use them in generation
- ⬆️ U1–U4 — pick and upscale one of the four
- 🔀 V1–V4 — create similar variants of the selected one
- ↔️ You can pan the frame or zoom out
- 🖌️ You can mask an area and repaint only that part
- 📐 Quality: 720p, 1080p or 4K

How to use
1. Describe the image in simple words.
2. Optionally attach photo references.
3. Choose format and quality.
4. Run generation and wait for the grid.
5. Tap U to pick one image, or V for similar variants.
6. Want to refine? Use pan, zoom or inpaint.`,

    [AiToolId.NANO_BANANA]: `🍌 Nano Banana
Create and edit images with Nano Banana.

- ✍️ Describe your idea in words — Nano Banana will create an image from your prompt
- 📸 Add your photo — change the image, replace details or fully transform it
- 🖼️ Add up to 14 images as examples or references
- 🎥 Attach a short video — the model understands its content and creates an image based on it
- 📐 Choose resolution: 512p, 1K, 2K or 4K
- 🌐 Web search is on automatically — Nano Banana can use up-to-date info like news, weather, logos and more
- 🔄 Keep editing — after generation, just write what to change. Without new files, the model continues with the previous image

How to use
1. Write what you want to create or change.
2. If needed, tap "Add photo/video" and attach files.
3. Choose image format and resolution.
4. Run generation.
5. Not happy with the result? Just write what to change — Nano Banana will continue editing.`,

    [AiToolId.SEEDREAM]: `🌱 Seedream
Create and edit images — great for ads, products and beautiful photos.

- ✍️ Describe your idea — Seedream creates an image from text
- 📸 Add your photo — change or refine the image
- 🖼️ Attach references for a more accurate result
- 📐 Choose quality: 2K or 4K

How to use
1. Choose image quality.
2. Optionally add your photo or references.
3. Write what you want to get.
4. Run generation.`,

    [AiToolId.FLUX]: `⚡ Flux
Creates realistic images with several modes for different tasks.

- 🎨 "Generate" — regular image from text (photo optional)
- 🔍 "Sharpen" — make a blurry photo sharper (no text needed)
- ✂️ "Remove" — remove an object: photo + mask (paint unwanted areas black)
- 👗 "Try-on" — person + clothing photo
- 🖼️ "Expand" — add space around the photo
- 📐 Choose format and quality

How to use
1. Choose a mode.
2. Add the required photos (the button will hint which ones).
3. If the mode asks — write a prompt.
4. Choose quality and run generation.`,

    [AiToolId.SORA]: `🎬 Sora
Create short videos from text with Sora.

- ✍️ Describe the scene — get a 4, 8 or 12 second clip
- 📸 Attach one photo — the video starts from it
- 🆕 "Create" — new video from scratch
- ⏩ "Extend" — continue an existing Sora clip
- ✏️ "Edit" — change a finished video with a prompt
- 🎭 Add characters from a short clip (no human faces)
- ⚠️ Human faces in photos may be rejected

Approximate cost
- 4 sec — 600 credits
- 8 sec — 1,200
- 12 sec — 1,800
- 1080p (Pro) costs 1.5× more

How to use
1. Choose mode: create, extend or edit.
2. Describe what happens in the scene.
3. Optionally add one photo or a finished video.
4. Choose format, resolution and duration.
5. Run and wait. To extend — tap "Extend video" under a finished clip.`,

    [AiToolId.KLING]: `🎥 Kling
Create short videos from text or photos with Kling.

- ✍️ Describe the scene — get a video
- 📸 1 photo — video starts from it
- 🔄 2 photos — smooth transition from first to last frame
- 🖼️ Up to 4 photos — multiple references at once
- 📐 Resolution: 720p or 1080p (1080p costs more)
- 🔊 "Sound: on" — the model adds audio
- 🚫 "What to avoid" field — write what you don't want

How to use
1. Optionally add up to 4 photos.
2. Describe what happens in the clip.
3. Choose format, duration, 720p/1080p and sound.
4. Run generation.`,

    [AiToolId.KLING_MOTION]: `💃 Kling Motion
Transfers motion from a video onto a person in a photo.

- 📸 You need a person photo and a short motion video
- 🕺 The person in the photo will move like in the video
- ⏱️ "Pose from photo" — short clips (up to ~10 sec)
- 🎞️ "Pose from video" — longer clips (up to ~30 sec)
- 🔊 You can keep sound from the motion video
- 📐 Resolution: 720p or 1080p

How to use
1. Upload a character photo.
2. Upload a motion video.
3. Choose pose mode and resolution.
4. Optionally add a scene description.
5. Run generation.`,

    [AiToolId.VEO]: `🌟 Veo
Create short videos from text — audio is included in the clip.

- ✍️ Describe the scene — get a 4, 6 or 8 second video
- 📐 Format: widescreen (16:9) or vertical stories (9:16)
- 🎞️ Quality: 720p, 1080p or 4K
- 📸 One photo — video starts from that frame
- 🔄 Two photos — smooth transition from first to second
- 🖼️ Up to 3 reference photos — "how it should look"
- 🆕 "New video" — from scratch
- ⏩ "Continue +7 sec" — add 7 more seconds to a previous Veo clip
- 🚫 "What to avoid" field — write what you don't want

How to use
1. Choose "New video" or "Continue +7 sec".
2. Choose format and quality.
3. Optionally attach photos or a previous video.
4. Describe what happens in the clip.
5. Run generation and wait.`,

    [AiToolId.HIGGSFIELD]: `🎞️ Higgsfield
Create videos with beautiful camera movement — like a director shot it.

- 📸 You can animate a photo
- 🎥 You can choose an effect or camera movement
- 📱 Great for ads and social media
- ✍️ Describe the scene — the model shoots "like a director"

How to use
1. Optionally add a photo.
2. Choose format, duration and effect.
3. Describe what should happen.
4. Run generation.`,

    [AiToolId.HEYGEN]: `🗣️ HeyGen
Create videos with a virtual host — the avatar speaks your text.

- ✍️ You write text — the avatar speaks it in the video
- 👤 Choose a face (avatar) and voice
- 📸 Upload your photo — get a "talking head"
- 📢 Great for ads, training and explainer videos

How to use
1. Enter the script the host should say.
2. Choose avatar and voice.
3. Choose format and settings in the "HeyGen" button.
4. Run generation.`,

    [AiToolId.TOPAZ]: `✨ Topaz
Doesn't create new content — improves existing photos or videos.

- 🔍 Makes images or videos sharper and cleaner
- 📐 You can upscale (×2, ×4, ×6)
- 🎞️ Great when a clip is blurry or too small

How to use
1. Upload a photo or video.
2. Choose how much to upscale.
3. Run processing and wait.`,

    [AiToolId.SEEDANCE]: `🌊 Seedance
Create videos using many files at once — text, photos, video and audio.

- 📎 You can combine text + photos + video + audio
- ⏱️ Clips up to 30 seconds
- ⏩ You can continue an existing video
- 🖼️ Many references at once (dozens of photos, several videos and audio files)

How to use
1. Choose format and duration.
2. Optionally add photos, video or audio.
3. Describe what you want to get.
4. Choose quality and run.`,

    [AiToolId.LUMA_RAY]: `🎥 Luma Ray
Animates an image into a short cinematic video.

- 📸 You can start from one photo
- 🔄 You can set start and end frames (two images)
- 🎬 Great camera movement and atmosphere
- ✍️ Describe where the camera moves and what the subject does

How to use
1. Optionally add start (and end) photos.
2. Describe object and camera motion.
3. Choose format, duration and style.
4. Run generation.`,

    [AiToolId.ELEVENLABS_VOICE]: `🎙️ ElevenLabs
Turns written text into speech — pick a voice and narrate.

- ✍️ You write text — get a voice that reads it
- 🗣️ Choose from different narrators
- 🎬 Great for videos, voice-over and podcasts

How to use
1. Enter your text.
2. Choose a voice.
3. Run generation.`,

    [AiToolId.VOICE_CLONE]: `🎤 Voice Clone
Learns from a short recording and then speaks in that voice.

- 📎 Upload a voice sample
- ✍️ Write any new text
- 🔊 Get narration "as if the same person said it"

How to use
1. Upload a short clean voice recording.
2. Enter your text.
3. Run generation.`,

    [AiToolId.VIDEO_TO_AUDIO]: `🔊 Video Voice-over
Adds voice-over to a clip without a proper audio track.

- 🎬 Upload a video — the model creates suitable voice-over or a sound layer
- 🌍 You can specify a language (or leave Russian)

How to use
1. Upload a video.
2. Optionally specify a language.
3. Run generation.`,

    [AiToolId.SOUND_GENERATOR]: `🔔 Sound Generation
Creates a sound effect from a description.

- ✍️ Describe a sound in words — get an audio file
- 💡 Examples: "rain on a roof", "footsteps in snow", "a creaking door"
- ⏱️ You can choose duration

How to use
1. Describe the sound as you hear it in your head.
2. Choose duration.
3. Run generation.`,

    [AiToolId.SUNO]: `🎵 Suno
Create a finished song or music — no instruments or studio needed.

- ✍️ Describe a song idea — get a track
- 🎸 Set genre and mood
- 📝 Write your own lyrics
- 🎹 Or make instrumental music without words

How to use
1. Describe the theme or song idea.
2. Optionally enter your lyrics.
3. Choose genre, mood and duration.
4. Run generation.`,
};

export function getEditorGuideText(
    toolId: AiToolId,
    locale: 'ru-RU' | 'en-US',
): string | undefined {
    return (locale === 'en-US' ? EN : RU)[toolId];
}
