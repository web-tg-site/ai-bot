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
import {
    formatAspectRatioLabel,
    formatAspectRatioToolbarLabel,
    getAspectRatioLabel,
} from '@/common/config/aspect-ratio.config';

const formatAspectRatioLabelEn = (ratio: string) =>
    formatAspectRatioLabel(ratio, 'en-US');

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
        privacyPolicy: 'Personal Data Processing Policy',
        userAgreement: 'User Agreement',
        refundPolicy: 'Refund Policy',
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
• Seedream
• Flux
• GPT Images

🎬 <b>Video creation & processing</b>
• Kling
• Veo
• Higgsfield
• HeyGen
• Seedance
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
            '⚠️ Midjourney is currently unavailable (provider issue). Generating with Flux…',
        generationTakingLonger:
            '⏳ Generation is taking longer than usual. Please wait…',
        videoToAudioPreparing:
            '⏳ Creating dub… This may take several minutes.',
        insufficientTokens:
            '❌ Not enough tokens. Upgrade your subscription or wait for the next token allocation.',
        noSubscription:
            '❌ An active subscription is required to use AI tools.\n\nTap «Subscription plans» to choose a plan.',
        error: (message) => `❌ Generation error:\n\n${message}`,
        errorWithCode: (code, message) => `❌ Error #${code}\n\n${message}`,
        tokensRefunded: (amount) =>
            `↩️ <b>${amount}</b> tokens refunded to your balance.`,
        errorByCode: {
            1: 'Something went wrong. Try again or choose another tool.',
            10: 'The service is temporarily unavailable. Try again later.',
            11: 'Generation took too long. Please try again.',
            12: 'Provider failure. Try again later or choose another tool.',
            13: 'Could not deliver the result. Please try again.',
            14: 'Could not check generation status. Try again later.',
        },
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
🎙️ Up to 2 audio generations per week

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
    payment: {
        invoiceCreated: (amountUsd, tariffName, periodName) =>
            `💳 <b>Subscription payment</b>

Plan: ${tariffName}
Period: ${periodName}
Amount: ~${amountUsd} USDT (pay with any supported cryptocurrency)

Tap the button below to pay via @send.
The link is valid for 1 hour.`,
        payButton: 'Pay',
        success: (tariffName, periodName, endsAt) =>
            `✅ <b>Payment received, subscription activated</b>

Plan: ${tariffName}
Period: ${periodName}
Valid until: ${endsAt}

All platform AI tools are now available.`,
        error: 'Could not create a payment invoice. Please try again later or contact support.',
        sbpComingSoon:
            'SBP payments are coming soon. You can pay with cryptocurrency using the USDT button for now.',
        notConfigured:
            '@send payments are temporarily unavailable. Please contact support.',
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
        privacyPolicy: `📄 <b>Personal Data Processing Policy</b>

<a href="https://docs.google.com/document/d/1sRw7-MkYo_SoqeSJOFOYQzccq8O_no-O/edit?usp=sharing&ouid=104945563170223870947&rtpof=true&sd=true">Open document</a>`,
        userAgreement: `📄 <b>User Agreement</b>

<a href="https://docs.google.com/document/d/1qOlS8jTUKMBUeDQ7z0AGU7RCV_cAc830/edit?usp=sharing&ouid=104945563170223870947&rtpof=true&sd=true">Open document</a>`,
        refundPolicy: `📄 <b>Refund Policy</b>

<a href="https://docs.google.com/document/d/1Vt0GgEPtXIDL54hxcNjT9iGlu_6ERFwT/edit?usp=sharing&ouid=104945563170223870947&rtpof=true&sd=true">Open document</a>`,
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
            [AiToolId.CLAUDE_SONNET]: 'Claude Sonnet',
            [AiToolId.GPT_IMAGES]: 'GPT Images',
            [AiToolId.FLUX]: 'Flux',
            [AiToolId.NANO_BANANA]: 'Nano Banana',
            [AiToolId.SEEDREAM]: 'Seedream',
            [AiToolId.MIDJOURNEY]: 'Midjourney',
            [AiToolId.KLING]: 'Kling',
            [AiToolId.VEO]: 'Veo',
            [AiToolId.SORA]: 'Sora',
            [AiToolId.SEEDANCE]: 'Seedance',
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
            [AiToolId.CLAUDE_SONNET]: 'Send text, a photo, file, or video.',
            [AiToolId.GPT_IMAGES]:
                "Describe the task and optionally add references (up to 10 images). The more precisely you specify each image's role, the more predictable the result.",
            [AiToolId.FLUX]:
                "Describe the task and optionally add references (up to 10 images). The more precisely you specify each image's role, the more predictable the result.",
            [AiToolId.NANO_BANANA]:
                "Describe the task and optionally add references (up to 4 images). The more precisely you specify each image's role, the more predictable the result.",
            [AiToolId.SEEDREAM]:
                "Describe the task and optionally add references (up to 10 images). The more precisely you specify each image's role, the more predictable the result.",
            [AiToolId.MIDJOURNEY]: 'Send a prompt to generate an image.',
            [AiToolId.KLING]:
                'Upload references (optional), adjust settings, then describe the scene.',
            [AiToolId.VEO]:
                'Upload references (optional), adjust settings, then describe the scene.',
            [AiToolId.SORA]:
                'Upload up to 2 frames for a transition, adjust settings, then describe the scene.',
            [AiToolId.SEEDANCE]:
                'Upload up to 2 frames for a transition, adjust settings, then describe the scene.',
            [AiToolId.HIGGSFIELD]:
                'Upload a reference (optional), adjust settings, then describe the scene.',
            [AiToolId.HEYGEN]:
                'Adjust settings and send a script for avatar video.',
            [AiToolId.TOPAZ]: 'Send a photo or video to upscale.',
            [AiToolId.ELEVENLABS_VOICE]:
                'Send text — the bot will read it aloud (up to 5000 characters).',
            [AiToolId.VOICE_CLONE]:
                '<b>Step 1:</b> send a voice message or audio file (voice sample).\n' +
                '<b>Step 2:</b> send text — the bot will speak it in that voice.',
            [AiToolId.VIDEO_TO_AUDIO]:
                'Send a video or audio file. The bot will dub it into Russian (or specify a language in the caption: en, es, de…).',
            [AiToolId.SOUND_GENERATOR]:
                'Describe the sound itself, not a scene (e.g. «heels on metal floor», not «a girl walks»).',
        },
    },
    gptChat: {
        newChat: '➕ New chat',
        myChats: '📂 My chats',
        clearHistory: '🗑 Clear history',
        webSearchOn: '🌐 Search: on',
        webSearchOff: '🌐 Search: off',
        replyModeLabel: (mode) => {
            if (mode === 'audio') return '🔊 Reply: audio';
            if (mode === 'both') return '🔊 Reply: text + audio';
            return '💬 Reply: text';
        },
        newChatCreated: '✅ New chat created. You can start messaging.',
        chatListTitle: '📂 <b>Your chats</b>\n\nSelect a conversation:',
        noChats: 'No saved chats yet',
        chatNotFound: 'Chat not found',
        chatOpened: (title, lastMessage) => {
            const preview = lastMessage
                ? `\n\n<i>Last message:</i>\n${lastMessage.slice(0, 200)}${lastMessage.length > 200 ? '…' : ''}`
                : '\n\n<i>History is empty — send your first message.</i>';
            return `💬 <b>${title}</b>${preview}`;
        },
        clearConfirm:
            '⚠️ <b>Clear the current chat history?</b>\n\nMessages will be deleted permanently.',
        confirmClear: '✅ Yes, clear',
        cancelClear: '❌ Cancel',
        noActiveChat: 'No active chat',
        historyCleared: '✅ Chat history cleared',
        clearCancelled: 'Clear cancelled',
        webSearchEnabled: 'Web search enabled',
        webSearchDisabled: 'Web search disabled',
        replyModeChanged: (mode) => {
            if (mode === 'audio') return 'Reply mode: audio only';
            if (mode === 'both') return 'Reply mode: text and audio';
            return 'Reply mode: text only';
        },
        controlsHint:
            'Chat controls:\n• New chat — start a separate conversation\n• My chats — switch between conversations\n• Search — up-to-date data from the web',
    },
    imageTool: {
        promptHint: 'Describe the task.',
        refAdded: (count, max) => `✅ Reference added: ${count}/${max}`,
        refDeleteButton: '🗑 Delete',
        refDeleted: '🗑 Reference removed',
        refNotFound: 'Reference already removed or not found',
        refLimitReached: (max) =>
            `⚠️ Reference limit (${max}). Tap "Continue to prompt".`,
        needPhotoOnRefStep:
            'Send reference photos or tap "Skip" / "Continue to prompt".',
        needPrompt: 'Send a prompt to generate.',
        aspectRatioButton: (ratio) => `📐 Aspect: ${ratio}`,
        resolutionButton: (resolution) => `🖼 Resolution: ${resolution}`,
        formatToolbarButton: (ratio) =>
            formatAspectRatioToolbarLabel(ratio, 'en-US'),
        changeFormatButton: '📐 Change format',
        changeResolutionButton: '🖼 Change resolution',
        changeQualityButton: '✨ Change quality',
        resolutionToolbarButton: (resolution) => `🖼 ${resolution}`,
        selectAspectRatioTitle: 'Choose aspect ratio:',
        selectResolutionTitle: 'Choose resolution:',
        selectQualityTitle: 'Choose quality:',
        aspectRatioPickerOption: (ratio) => formatAspectRatioLabelEn(ratio),
        aspectRatioPickerSelected: (ratio) =>
            `✓ ${formatAspectRatioLabelEn(ratio)}`,
        resolutionPickerOption: (resolution, tokens) =>
            `${resolution} · ${tokens} tok.`,
        resolutionPickerSelected: (resolution, tokens) =>
            `✓ ${resolution} · ${tokens} tok.`,
        qualityPickerOption: (label, tokens) => `${label} · ${tokens} tok.`,
        qualityPickerSelected: (label, tokens) => `✓ ${label} · ${tokens} tok.`,
        aspectRatioChanged: (ratio) =>
            `Aspect: ${formatAspectRatioLabelEn(ratio)}`,
        resolutionChanged: (resolution, tokens) =>
            `Resolution: ${resolution} (${tokens} tokens)`,
        qualityChanged: (label, tokens) =>
            `Quality: ${label} (${tokens} tokens)`,
        topazScaleButton: (scale, tokens, selected) =>
            `${selected ? '✓ ' : ''}×${scale} (${tokens} tok.)`,
        topazScaleChanged: (scale, tokens) =>
            `Upscale scale: ×${scale} (${tokens} tokens)`,
        continueToPrompt: '➡️ Continue to prompt',
        skipRefs: '⏭ Skip',
        settingsButton: '📐 Parameters',
        backToSettings: '◀️ Back',
        backToEditor: '◀️ Back to editor',
        settingsMenuTitle: 'Generation settings',
        keyboardUpdated: (toolName) => toolName,
        formatLine: (format, resolution, quality) => {
            const parts = [
                `Format: <b>${getAspectRatioLabel(format, 'en-US')}</b> · <b>${format}</b>`,
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
            asFile ? '✓ Send as file' : '📎 Send as file',
        sendAsFileChanged: (asFile) =>
            asFile
                ? 'Results will be sent as a <b>file</b>'
                : 'Results will be sent as a <b>photo</b>',
        deliveryLine: (asFile) =>
            asFile ? 'Delivery: <b>file</b>' : 'Delivery: <b>photo</b>',
    },
    videoTool: {
        promptHint: 'Describe the scene and camera movement.',
        refAdded: (count, max) => `✅ Reference added: ${count}/${max}`,
        refDeleteButton: '🗑 Delete',
        refDeleted: '🗑 Reference removed',
        refNotFound: 'Reference already removed or not found',
        refLimitReached: (max) =>
            `⚠️ Reference limit (${max}). Tap "Continue to prompt".`,
        needPhotoOnRefStep:
            'Send reference photos or tap "Skip" / "Continue to prompt".',
        needPrompt: 'Send a prompt to generate video.',
        aspectRatioButton: (ratio) => `📐 Aspect: ${ratio}`,
        resolutionButton: (resolution) => `🖼 Resolution: ${resolution}`,
        formatToolbarButton: (ratio) =>
            formatAspectRatioToolbarLabel(ratio, 'en-US'),
        changeFormatButton: '📐 Change format',
        changeResolutionButton: '🖼 Change resolution',
        changeQualityButton: '✨ Change quality',
        changeDurationButton: '⏱ Change duration',
        changeStyleButton: '🎨 Change style',
        resolutionToolbarButton: (resolution) => `🖼 ${resolution}`,
        selectAspectRatioTitle: 'Choose aspect ratio:',
        selectResolutionTitle: 'Choose resolution:',
        selectQualityTitle: 'Choose quality:',
        selectDurationTitle: 'Choose duration:',
        selectStyleTitle: 'Choose style:',
        aspectRatioPickerOption: (ratio) => formatAspectRatioLabelEn(ratio),
        aspectRatioPickerSelected: (ratio) =>
            `✓ ${formatAspectRatioLabelEn(ratio)}`,
        resolutionPickerOption: (resolution, tokens) =>
            `${resolution} · ${tokens} tok.`,
        resolutionPickerSelected: (resolution, tokens) =>
            `✓ ${resolution} · ${tokens} tok.`,
        qualityPickerOption: (label, tokens) => `${label} · ${tokens} tok.`,
        qualityPickerSelected: (label, tokens) => `✓ ${label} · ${tokens} tok.`,
        aspectRatioChanged: (ratio) =>
            `Aspect: ${formatAspectRatioLabelEn(ratio)}`,
        resolutionChanged: (resolution, tokens) =>
            `Resolution: ${resolution} (${tokens} tokens)`,
        qualityChanged: (label, tokens) =>
            `Quality: ${label} (${tokens} tokens)`,
        durationToolbarButton: (seconds, credits) =>
            `⏱ ${seconds}s · ${credits} tok.`,
        durationPickerOption: (seconds, credits) =>
            `${seconds}s · ${credits} tok.`,
        durationPickerSelected: (seconds, credits) =>
            `✓ ${seconds}s · ${credits} tok.`,
        durationChanged: (seconds, credits) =>
            `Duration: ${seconds}s (${credits} tokens)`,
        styleToolbarButton: (styleLabel) => `🎨 ${styleLabel}`,
        stylePickerOption: (styleLabel) => styleLabel,
        stylePickerSelected: (styleLabel) => `✓ ${styleLabel}`,
        styleChanged: (styleLabel) => `Style: ${styleLabel}`,
        continueToPrompt: '➡️ Continue to prompt',
        skipRefs: '⏭ Skip',
        settingsButton: '⚙️ Parameters',
        backToSettings: '◀️ Back',
        backToEditor: '◀️ Back to editor',
        settingsMenuTitle: 'Video settings',
        keyboardUpdated: (toolName) => toolName,
        formatLine: (format, resolution, quality) => {
            const parts = [
                `Format: <b>${getAspectRatioLabel(format, 'en-US')}</b> · <b>${format}</b>`,
            ];
            if (resolution) {
                parts.push(`<b>${resolution}</b>`);
            }
            if (quality) {
                parts.push(`<b>${quality}</b>`);
            }
            return parts.join(' · ');
        },
        durationLabel: (seconds) => (seconds >= 60 ? '1 min' : `${seconds}s`),
        summaryLine: ({
            format,
            resolution,
            qualityLabel,
            durationSeconds,
            styleLabel,
            credits,
        }) => {
            const parts: string[] = [];
            if (format) {
                parts.push(
                    `<b>${getAspectRatioLabel(format, 'en-US')}</b> · <b>${format}</b>`,
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
                        ? '<b>1 min</b>'
                        : `<b>${durationSeconds}s</b>`,
                );
            }
            if (styleLabel) {
                parts.push(`<b>${styleLabel}</b>`);
            }
            if (credits) {
                parts.push(`~<b>${credits}</b> tokens`);
            }
            return parts.join(' · ');
        },
        sendAsFileButton: (asFile) =>
            asFile ? '✓ Send as file' : '📎 Send as file',
        sendAsFileChanged: (asFile) =>
            asFile
                ? 'Results will be sent as a <b>file</b>'
                : 'Results will be sent as a <b>video</b>',
        deliveryLine: (asFile) =>
            asFile ? 'Delivery: <b>file</b>' : 'Delivery: <b>video</b>',
    },
    voiceTool: {
        selectVoiceButton: '🎙 Available voices',
        confirmVoiceButton: '✓ Confirm',
        rejectVoiceButton: '✗ No',
        backToVoiceList: '◀️ Back to list',
        backToEditor: '◀️ Back to editor',
        settingsMenuTitle: 'Available voices',
        previewGenerating: '⏳ Generating voice sample...',
        previewCaption: (voiceName) =>
            `Voice sample: <b>${voiceName}</b>\n\nConfirm or pick another one.`,
        voiceConfirmed: (voiceName) => `✅ Voice selected: <b>${voiceName}</b>`,
        voiceRejected: 'Pick another voice from the list.',
        voiceLine: (voiceName) => `Voice: <b>${voiceName}</b>`,
        voicePickerOption: (voiceName) => voiceName,
        voicePickerSelected: (voiceName) => `✓ ${voiceName}`,
        keyboardUpdated: (toolName) => toolName,
        sendAsFileButton: (asFile) =>
            asFile ? '✓ Audio file' : '🎙 Voice message',
        sendAsFileChanged: (asFile) =>
            asFile
                ? 'Results will be sent as an <b>audio file</b>'
                : 'Results will be sent as a <b>voice message</b>',
        deliveryLine: (asFile) =>
            asFile
                ? 'Delivery: <b>audio file</b>'
                : 'Delivery: <b>voice message</b>',
    },
};
