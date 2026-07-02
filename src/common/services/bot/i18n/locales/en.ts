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

export const en: I18nBundle = {
    lang: UserLanguage.EN,
    localeTag: 'en-US',
    buttons: {
        back: 'Back',
        start: 'Start',
        textCategory: '🧠 Text',
        imageCategory: '🎨 Images',
        videoCategory: '🎬 Video',
        audioCategory: '🎙️ Audio',
        mySub: 'My subscription',
        support: 'Support',
        settings: '⚙️ Settings',
        subsTariffs: 'Subscription plans',
        freeWeek: '1 Week FREE',
        activateTrial: 'Activate trial access',
        telegram: 'Telegram',
        email: 'Email',
        sbp: (amount) => `SBP ${amount} ₽`,
        usdt: (amount) => `USDT ${amount} ₮`,
    },
    settings: {
        title: '⚙️ <b>Settings</b>\n\nChoose interface language:',
        languageChanged: '✅ Language changed',
    },
    languagePicker: {
        prompt: '🌐 <b>Choose your language / Выберите язык</b>',
        ru: '🇷🇺 Русский',
        en: '🇬🇧 English',
    },
    home: {
        notRegistered: `<b>Welcome to ${BOT_NAME}</b>

An all-in-one AI platform in Telegram for work, business, creativity, and everyday tasks.

Inside you'll find the world's best AI models:

🧠 <b>Text & analysis</b>
• GPT
• File processing
• Image analysis
• Web search

🎨 <b>Image generation & editing</b>
• Midjourney
• Nano Banana
• Seedream 4.5
• Flux
• GPT Images

🎬 <b>Video creation & processing</b>
• Kling
• Veo
• Higgsfield
• HeyGen
• Seedance 2.0
• Topaz AI

🎙️ <b>Voice & audio</b>
• ElevenLabs
• Voice cloning
• Video dubbing
• Sound generation on demand

Choose a section below and get started. All tools are available in one place — no need to switch between dozens of services.`,
        registered: `🚀 <b>All AI tools in one place</b>

Choose what you'd like to work with:
🧠 Text
🎨 Images
🎬 Video
🎙️ Audio

Tap a section below.`,
    },
    ai: {
        textBots: `🧠 AI assistants

Choose a model for text, files, data analysis, images, and web search.

Select a model below.`,
        imageBots: `🎨 Image generation

Create images, concepts, illustrations, ad creatives, and edit existing photos.

Select a model below.`,
        videoBots: `🎬 Video generation & processing

Create videos with AI, animate images, and enhance existing clips.

Select a model below.`,
        audioBots: `🎙️ Audio tools

Create voiceovers, clone voices, generate sounds, and work with audio content.

Select a tool below.`,
    },
    aiResult: {
        voiceCloneStep2:
            '✅ <b>Step 1 complete</b> — voice sample received.\n\n' +
            '<b>Step 2:</b> send the text you want spoken in this voice.',
        voiceCloneNeedSample:
            '🎙 First send a <b>voice message</b> or <b>audio file</b> — this will be the voice sample for cloning.',
        voiceCloneNeedText:
            '✍️ Now send the <b>text</b> you want spoken with the cloned voice.',
        voiceCloneSampleUpdated:
            '✅ Voice sample updated. Send text for voiceover.',
        toolSelected: (toolName, instruction) =>
            `🛠 <b>${toolName}</b>\n\n${instruction}\n\n<i>Tap «Back» to exit the tool.</i>`,
        generating: '⏳ Generating… Please wait.',
        asyncStarted:
            '⏳ Generation started. The result will arrive in this chat when ready.',
        midjourneyFallback:
            '⚠️ Midjourney via Sharpii is currently unavailable (provider issue). Generating with Flux…',
        videoToAudioPreparing:
            '⏳ Creating dub… This may take several minutes.',
        insufficientTokens:
            '❌ Not enough tokens. Upgrade your subscription or wait for the next token allocation.',
        noSubscription:
            '❌ An active subscription is required to use AI tools.\n\nTap «Subscription plans» to choose a plan.',
        error: (message) => `❌ Generation error:\n\n${message}`,
        sendTextOrFile: 'Send text or a file for generation.',
        mySubscription: (subscribeType, tokenLeft, subscriptionEndsAt) => {
            const endDate = subscriptionEndsAt
                ? formatDate(subscriptionEndsAt, UserLanguage.EN)
                : '—';

            return `📋 <b>My subscription</b>

Plan: <b>${subscribeType}</b>
Tokens left: <b>${formatNumber(tokenLeft, UserLanguage.EN)}</b>
Valid until: <b>${endDate}</b>`;
        },
    },
    subs: {
        chooseSub: `💎 <b>${BOT_NAME} plans</b>
Get access to all platform features in one Telegram bot.
Your subscription includes:

✅ GPT & AI assistants
✅ Image generation
✅ Video creation & processing
✅ Voiceover & audio tools
✅ Access to all platform updates

Choose a subscription period below:`,
        subTextForPeriod: (plan) =>
            `📅 <b>Selected period: ${en.records.subPlanToPeriod[plan]}</b>

Now choose a plan based on how intensively you use the platform.

⚡ LITE — for everyday tasks and getting started

🚀 PRO — for regular work with AI tools

👑 BUSINESS — for entrepreneurs, teams, and active content creation
Choose a plan below.`,
        subTextForSubType: (type, plan) => {
            const info = SUB_PLAN_TYPE_TO_TARIFF_INFO[plan][type]!;

            return `<b>${en.records.subTypeToText[type]}</b>

Access period: ${en.records.subPlanToPeriod[plan]}
AI credits: ${formatNum(info.credits)}

${en.records.subTypeDescription[type]}

Plan includes:
${getTariffIncludesText(type, plan, en)}

Payment methods:
💳 SBP (Russian cards)
₮ USDT

Choose a payment method below.`;
        },
    },
    freeSub: {
        text: `🎁 <b>7-day trial access</b>

Try all ${BOT_NAME} features for free.

For 7 days you'll have access to the full set of AI models for text, images, video, and audio.
Trial limits:

🧠 Up to 50 AI requests per week
🎨 Up to 5 image generations per week
🎬 Up to 1 video generation per week
🎙️ Up to 3 audio generations per week

After the trial ends, a paid subscription is required to continue.
Full access is available on any paid plan.`,
        activateText: (endsAt) => `✅ <b>Trial access activated</b>

Plan: Trial access
Valid until: ${endsAt}

All platform AI tools are now available.


Tap «Start» to begin.`,
    },
    subActivate: {
        text: (tariffName, endsAt) => `✅ <b>Subscription activated</b>

Plan: ${tariffName}
Valid until: ${endsAt}

All platform AI tools are now available.

Tap «Start» to begin.`,
    },
    support: {
        text: `💬 <b>${BOT_NAME} support</b>

Need help or have a question?

Contact us directly — we'll help with anything from billing and subscriptions to AI tools and platform features.

📩 Tap your preferred contact method below.`,
        telegram: `💬 <b>${BOT_NAME} support</b>

Message us on Telegram: <a href="https://t.me/project_ai_support">https://t.me/project_ai_support</a>`,
        email: `💬 <b>${BOT_NAME} support</b>

Email us: <a href="mailto:support@project-ai.com">support@project-ai.com</a>`,
    },
    records: {
        subPlanToPeriod: {
            MONTHLY: '1 month',
            THREE_MONTHS: '3 months',
            SIX_MONTHS: '6 months',
            YEARLY: '1 year',
        },
        subTypeToText: {
            FREE: 'Free',
            LITE: '⚡ LITE',
            PRO: '🚀 PRO',
            BUSINESS: '👑 BUSINESS',
            NOT_SUBSCRIBED: 'Not subscribed',
        },
        subTypeDescription: {
            LITE: 'Great for getting started and regular use.',
            PRO: 'For active work with AI, content, and business tasks.',
            BUSINESS:
                'Maximum platform capabilities for business, teams, and professional use.',
        },
        tariffIncludes: {
            textRequests: (n) => `🧠 Text requests — ${n}`,
            images: (n) => `🎨 Images — ${n}`,
            video: (n) => `🎬 Video (3 sec) — ${n}`,
            audio: (n) => `🎙 Audio — ${n}`,
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
            [AiToolId.VOICE_CLONE]: 'Voice Clone',
            [AiToolId.VIDEO_TO_AUDIO]: 'Video Dubbing',
            [AiToolId.SOUND_GENERATOR]: 'Sound Generator',
        },
        instructions: {
            [AiToolId.GPT]: 'Send text, a photo, file, or video.',
            [AiToolId.GPT_IMAGES]: 'Send a text prompt to generate an image.',
            [AiToolId.FLUX]:
                'Send a text prompt or photo with a description to generate an image.',
            [AiToolId.NANO_BANANA]: 'Send a text prompt to generate an image.',
            [AiToolId.SEEDREAM]: 'Send a text prompt to generate an image.',
            [AiToolId.MIDJOURNEY]: 'Send a text prompt to generate an image.',
            [AiToolId.KLING]:
                'Send a text prompt or photo to generate video (5 sec).',
            [AiToolId.VEO]:
                'Send a text prompt or photo to generate video (6 sec).',
            [AiToolId.SORA]: 'Send a text prompt to generate video (10 sec).',
            [AiToolId.SEEDANCE]:
                'Send a text prompt to generate video (5 sec).',
            [AiToolId.HIGGSFIELD]:
                'Send a text prompt to generate video (5 sec).',
            [AiToolId.HEYGEN]:
                'Send a script to generate avatar video (5 sec).',
            [AiToolId.TOPAZ]: 'Send a video or photo to upscale quality.',
            [AiToolId.ELEVENLABS_VOICE]:
                'Send text — the bot will read it aloud (up to 5000 characters).',
            [AiToolId.VOICE_CLONE]:
                '<b>Step 1:</b> send a voice message or audio file (voice sample).\n' +
                '<b>Step 2:</b> send text — the bot will speak it in that voice.',
            [AiToolId.VIDEO_TO_AUDIO]:
                'Send a video or audio file. The bot will dub it into Russian (or specify a language in the caption: en, es, de…).',
            [AiToolId.SOUND_GENERATOR]:
                'Describe a sound or effect (e.g. «loud thunder», «footsteps on gravel», «space whoosh»).',
        },
    },
};
