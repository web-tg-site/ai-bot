import { AiToolId } from '@/common/services/ai/types';

const RU: Partial<Record<AiToolId, string>> = {
    [AiToolId.GPT]: `GPT — умный помощник в чате. Пишешь вопрос или задачу — он отвечает.

Простыми словами
• поможет написать текст, пост, письмо, сценарий
• объяснит сложное простыми словами
• разберёт документ, таблицу или код
• посмотрит на фото и скажет, что на нём
• можно продолжать диалог: «сделай короче», «перепиши мягче»

Как пользоваться
1. Напиши задачу своими словами.
2. Чем подробнее — тем лучше ответ.
3. При желании прикрепи файл или фото.
4. Отправь.
5. Если нужно поправить — просто напиши ещё раз, что изменить.`,

    [AiToolId.CLAUDE_SONNET]: `Claude — тоже умный помощник в чате. Особенно удобен для длинных текстов и сложных разборов.

Простыми словами
• хорошо читает большие документы
• помогает писать и править тексты
• разбирает код и сложные задачи
• можно прикрепить файл или фото
• отвечает спокойно и по делу

Как пользоваться
1. Напиши, что нужно.
2. Добавь файл или фото, если они важны.
3. Скажи, в каком виде хочешь ответ (список, план, коротко).
4. Отправь и при необходимости уточняй в чате.`,

    [AiToolId.GPT_IMAGES]: `Sora (картинки) — делает и правит изображения по тексту.

Простыми словами
• напиши описание — получишь новую картинку
• можно прикрепить до 10 своих фото как примеры
• хорошо пишет текст на картинке (вывески, надписи)
• можно выбрать качество: 1K / 2K / 4K

Как пользоваться
1. Опиши, что нужно на картинке.
2. При желании добавь фото-примеры.
3. Выбери формат и качество.
4. Запусти генерацию.`,

    [AiToolId.MIDJOURNEY]: `Midjourney — рисует картинки по описанию. Сначала даёт сетку из 4 вариантов.

Простыми словами
• напиши, что хочешь увидеть — получишь 4 картинки сразу
• U1–U4 — выбрать и увеличить одну из четырёх
• V1–V4 — сделать похожие варианты выбранной
• можно потом сдвинуть кадр в сторону или отдалить
• можно закрасить кусок и перерисовать только его
• качество: 720p / 1080p / 4K

Как пользоваться
1. Опиши картинку простыми словами.
2. Выбери формат и качество.
3. Запусти генерацию и подожди сетку.
4. Нажми U, чтобы взять одну картинку, или V, чтобы сделать похожие.`,

    [AiToolId.NANO_BANANA]: `Nano Banana — делает картинки по твоему тексту.

Простыми словами
• напиши, что хочешь увидеть — получишь картинку
• можно прикрепить своё фото, чтобы изменить его
• можно прикрепить несколько фото как примеры (до 14)
• можно прикрепить короткое видео — модель поймёт, о чём оно, и сделает картинку
• размер: 512 / 1K / 2K / 4K
• поиск в сети включён всегда (погода, новости, логотипы)
• если после результата снова написать текст без новых файлов — она продолжит править ту же картинку

Как пользоваться
1. Напиши словами, какую картинку хочешь.
2. При желании прикрепи фото или видео.
3. Выбери формат и размер картинки.
4. Запусти генерацию.`,

    [AiToolId.SEEDREAM]: `Seedream — ещё одна модель для картинок. Удобна для рекламы, товаров и красивых фото.

Простыми словами
• делает картинку по тексту
• может править твоё фото
• можно прикрепить примеры
• есть большой размер (2K / 4K)

Как пользоваться
1. Выбери размер картинки.
2. При желании добавь своё фото.
3. Напиши, что хочешь получить.
4. Запусти генерацию.`,

    [AiToolId.FLUX]: `Flux — делает реалистичные картинки по тексту. Хорошо подходит для рекламы, товаров и «как настоящее фото».

Простыми словами
• напиши описание — получишь картинку
• можно прикрепить своё фото как пример
• удобна для рекламы, товаров, людей и презентаций
• можно выбрать формат и качество

Как пользоваться
1. Выбери формат.
2. При желании добавь фото-пример.
3. Напиши, что хочешь получить.
4. Выбери качество и запусти генерацию.`,

    [AiToolId.SORA]: `Sora (видео) — делает короткое видео по тексту.

Простыми словами
• ролики на 4, 8 или 12 секунд
• можно прикрепить одно фото — с него начнётся видео
• «Создать» — новое видео с нуля
• «Продлить» — продолжить уже готовый ролик Sora
• «Редактировать» — изменить готовое видео по тексту
• можно добавить своих персонажей из короткого клипа (без лиц людей)
• лица людей на фото иногда отклоняются

Сколько стоит примерно
• 4 сек — 600 кредитов
• 8 сек — 1 200
• 12 сек — 1 800
• 1080p (Pro) дороже в 1.5 раза

Как пользоваться
1. Напиши, что происходит в сцене.
2. При желании добавь одно фото или готовое видео для правки.
3. Выбери формат, разрешение и длительность.
4. Запусти и подожди.
5. Чтобы продлить: под готовым роликом нажми «Продлить видео» и опиши продолжение.`,

    [AiToolId.KLING]: `Kling — делает короткое видео по тексту или фото.

Простыми словами
• напиши сцену — получишь видео
• 1 фото — видео начнётся с него
• 2 фото — от первого кадра ко второму
• до 4 фото — несколько примеров сразу
• разрешение: 720p или 1080p (1080p дороже)
• «Звук: вкл» — модель сама добавит звук
• поле «Чего не должно быть» — напиши, чего избегать

Как пользоваться
1. При желании добавь до 4 фото.
2. Напиши, что происходит в ролике.
3. Выбери формат, длительность, 720p/1080p и звук.
4. Запусти генерацию.`,

    [AiToolId.KLING_MOTION]: `Kling Motion — берёт движение из видео и «надевает» его на человека с фото.

Простыми словами
• нужно фото человека и короткое видео с движением
• человек на фото начнёт двигаться как в видео
• «Поза с фото» — короткие клипы (до ~10 сек)
• «Поза из видео» — можно подлиннее (до ~30 сек)
• можно оставить звук с видео движения
• разрешение: 720p или 1080p

Как пользоваться
1. Загрузи фото персонажа.
2. Загрузи видео с движением.
3. Выбери позу и разрешение.
4. При желании допиши описание сцены.
5. Запусти генерацию.`,

    [AiToolId.VEO]: `Veo — делает короткое видео по тексту. Звук в ролике уже есть сам по себе.

Простыми словами
• напиши сцену — получишь видео на 4, 6 или 8 секунд
• формат только широкий (16:9) или вертикальный сторис (9:16)
• качество: 720p / 1080p / 4K
• одно фото — видео начнётся с этого кадра
• два фото — плавный переход от первого ко второму
• до 3 фото-примеров — «как должно выглядеть»
• «Новое видео» — с нуля
• «Продолжить +7 сек» — дописать ещё 7 секунд к своему прошлому ролику Veo
• поле «Чего не должно быть» — напиши, чего избегать

Как пользоваться
1. Выбери «Новое видео» или «Продолжить +7 сек».
2. Выбери формат и качество.
3. При желании прикрепи фото или прошлое видео.
4. Напиши, что происходит в ролике.
5. Запусти генерацию и подожди.`,

    [AiToolId.HIGGSFIELD]: `Higgsfield — делает видео, часто с красивым движением камеры.

Простыми словами
• можно оживить фото
• можно выбрать эффект / движение камеры
• подходит для рекламы и соцсетей
• опиши сцену — модель снимет «как режиссёр»

Как пользоваться
1. При желании добавь фото.
2. Выбери формат, длительность и эффект.
3. Напиши, что должно происходить.
4. Запусти генерацию.`,

    [AiToolId.HEYGEN]: `HeyGen — делает видео, где говорит виртуальный ведущий (аватар).

Простыми словами
• пишешь текст — аватар произносит его в видео
• можно выбрать лицо (аватар) и голос
• можно загрузить своё фото — получится «говорящая голова»
• удобно для рекламы, обучения и объясняющих роликов

Как пользоваться
1. Впиши текст, который должен сказать ведущий.
2. Выбери аватар и голос.
3. Выбери формат и настройки в кнопке «HeyGen».
4. Запусти генерацию.`,

    [AiToolId.TOPAZ]: `Topaz — не рисует новое. Он улучшает уже готовое фото или видео.

Простыми словами
• делает картинку/видео чётче и чище
• можно увеличить размер (×2, ×4, ×6)
• подходит, если ролик мыльный или мелкий

Как пользоваться
1. Загрузи фото или видео.
2. Выбери, во сколько раз улучшить.
3. Запусти обработку и подожди.`,

    [AiToolId.SEEDANCE]: `Seedance — делает видео и умеет опираться сразу на много файлов.

Простыми словами
• можно дать текст + фото + видео + звук вместе
• ролики до 30 секунд
• можно продолжить уже готовое видео
• много примеров сразу (десятки фото, несколько видео и аудио)

Как пользоваться
1. Выбери формат и длительность.
2. При желании добавь фото, видео или звук.
3. Напиши, что должно получиться.
4. Выбери качество и запусти.`,

    [AiToolId.LUMA_RAY]: `Luma Ray — оживляет картинку в короткое кинематографичное видео.

Простыми словами
• можно начать с одного фото
• можно задать начало и конец (два кадра)
• хорошо получается движение камеры и атмосфера
• опиши, куда едет камера и что делает объект

Как пользоваться
1. При желании добавь фото начала (и конца).
2. Напиши движение объекта и камеры.
3. Выбери формат, длительность и стиль.
4. Запусти генерацию.`,

    [AiToolId.ELEVENLABS_VOICE]: `Озвучка текста — превращает написанный текст в речь.

Простыми словами
• пишешь текст — получаешь голос, который его читает
• можно выбрать разных дикторов
• подходит для роликов, озвучки, подкастов

Как пользоваться
1. Впиши текст.
2. Выбери голос.
3. Запусти генерацию.`,

    [AiToolId.VOICE_CLONE]: `Клон голоса — учится на короткой записи и потом говорит твоим голосом.

Простыми словами
• загружаешь образец голоса
• пишешь любой новый текст
• получаешь озвучку «как будто это сказал тот же человек»

Как пользоваться
1. Загрузи короткую чистую запись голоса.
2. Впиши текст.
3. Запусти генерацию.`,

    [AiToolId.VIDEO_TO_AUDIO]: `Дубляж / звук к видео — добавляет звук к ролику без нормальной дорожки.

Простыми словами
• загружаешь видео
• модель делает подходящую озвучку / звуковой слой
• можно указать язык (или оставить русский)

Как пользоваться
1. Загрузи видео.
2. При желании укажи язык.
3. Запусти генерацию.`,

    [AiToolId.SOUND_GENERATOR]: `Генератор звуков — делает звуковой эффект по описанию.

Простыми словами
• напиши звук словами — получишь аудиофайл
• примеры: «дождь по крыше», «шаги по снегу», «дверь скрипит»
• можно выбрать длительность

Как пользоваться
1. Опиши звук как слышишь его в голове.
2. Выбери длительность.
3. Запусти генерацию.`,

    [AiToolId.SUNO]: `Suno — делает готовую песню или музыку без инструментов.

Простыми словами
• опиши идею песни — получишь трек
• можно задать жанр и настроение
• можно написать свой текст куплетов
• можно сделать просто музыку без слов (инструментал)

Как пользоваться
1. Опиши тему или идею песни.
2. При желании впиши свой текст.
3. Выбери жанр, настроение и длительность.
4. Запусти генерацию.`,
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

    [AiToolId.MIDJOURNEY]: `Midjourney generates images from text prompts. Each generation returns a 4-image grid; then you can upsample (U1–U4), vary (V1–V4), pan, zoom out, or Vary Region (inpaint).

What you can do
• create images from a text prompt
• choose aspect ratio
• quality: 720p / 1080p / 4K
• upsample a selected frame (U1–U4)
• create variations (V1–V4)
• expand the canvas (pan / zoom out)
• repaint a masked region (Vary Region)

How to use
1. Describe the image you want.
2. Choose aspect ratio and quality.
3. Run generation — you get a 4-image grid.
4. Tap U1–U4 or V1–V4, then pan / zoom / inpaint if needed.`,

    [AiToolId.NANO_BANANA]: `Nano Banana is Google's Gemini image model family via the Gemini API.
Create or edit images with text, up to 14 image refs, video-to-image, Thinking, and Google Search grounding.

What you can do
• text-to-image up to 4K (incl. 512px)
• edit / combine up to 14 references
• video → image
• thinking minimal/high
• Google Search / Image Search grounding
• multi-turn follow-up edits without new refs

How to use
1. Describe the result.
2. Optionally attach photo or video references.
3. Pick aspect ratio and resolution.
4. Optionally enable Thinking and Search.
5. Run generation.`,

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
• 1080p — ×1.5 (Pro)

How to use
1. Describe the scene.
2. Optionally upload one photo or a video to edit.
3. Choose format, resolution, and duration.
4. Run generation.

Extend video: tap "Extend video" under a finished clip, describe how the scene should continue, and generate again. Extension costs from 600 credits (4 sec).`,

    [AiToolId.KLING]: `Kling 3.0 — direct Kling API for video generation.
Suits ads, cinematic scenes, product videos, and image animation.

What you can do
• text → video
• image → video (first / last frame)
• multi-image → video (up to 4 photos)
• resolution 720p / 1080p
• sound on/off
• negative prompt

How to use
1. Optionally upload up to 4 photos (1–2 = start/end, 3–4 = multi-image).
2. Describe the scene; optionally add a negative prompt.
3. Choose aspect, duration, resolution (720p/1080p), and sound.
4. Run generation.`,

    [AiToolId.KLING_MOTION]: `Kling Motion — transfer motion from a reference video onto a character photo.

Required
• character photo
• motion video (under 10s for “Pose from photo”, up to 30s for “Pose from video”)
• optional prompt

Parameters
• character pose: from photo / from video
• keep sound from the motion video
• resolution: 720p / 1080p

How to use
1. Upload a character photo and a motion video.
2. Choose pose mode and resolution.
3. Optionally describe the scene and run generation.`,

    [AiToolId.VEO]: `Veo is Google's video model via the Gemini API.
Veo 3.1: 720p/1080p/4K, 16:9 or 9:16 only, native audio always on; first/last frame, up to 3 reference images, and Extend (+7s at 720p).

What you can do
• text → video with synced audio
• image → video (first frame)
• first → last frame transitions
• up to 3 reference images
• extend a previous Veo clip
• negative prompt

How to use
1. Choose 16:9 or 9:16 and resolution (1080p/4K forces 8s).
2. Create or Extend mode.
3. Optionally attach 1–2 frames or up to 3 references.
4. Describe the scene (and negative prompt).
5. Run generation.`,

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
