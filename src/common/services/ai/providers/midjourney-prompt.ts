import { stripAttachmentMentionManifest } from '@/common/services/bot/utils/image-references';

/** Stabilizer for MJ image prompts — reduces split / before-after / extra people. */
export const MIDJOURNEY_REF_ANTI_SPLIT_SUFFIX =
    'single cohesive image, no split panels, no side-by-side comparison, no extra people, keep the same subject';

const DEFAULT_REF_PROMPT =
    'Create an image consistent with the attached reference photos.';

/**
 * Builds the Apiframe Midjourney imagine prompt:
 * `<imageUrls…> <user text> [anti-split] --q <q>`
 * Strips the bot/mini-app attachment manifesto so MJ never sees @image tags.
 */
export function buildMidjourneyImaginePrompt(params: {
    imageUrls: readonly string[];
    rawPrompt?: string | null;
    qualityQ: string | number;
}): string {
    const { imageUrls, qualityQ } = params;
    const cleaned = stripAttachmentMentionManifest(params.rawPrompt ?? '')
        .replace(/\s--q\s+[\d.]+/gi, '')
        .trim();

    let textPart = cleaned || (imageUrls.length ? DEFAULT_REF_PROMPT : '');
    if (!textPart && !imageUrls.length) {
        throw new Error('Midjourney requires a prompt');
    }

    if (imageUrls.length) {
        textPart = textPart
            ? `${textPart} ${MIDJOURNEY_REF_ANTI_SPLIT_SUFFIX}`
            : MIDJOURNEY_REF_ANTI_SPLIT_SUFFIX;
    }

    return `${[...imageUrls, textPart].filter(Boolean).join(' ')} --q ${qualityQ}`;
}
