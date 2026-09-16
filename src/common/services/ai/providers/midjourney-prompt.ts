import { stripAttachmentMentionManifest } from '@/common/services/bot/utils/image-references';

/** Keep MJ glued to the reference photo (0–2). */
export const MIDJOURNEY_REF_IMAGE_WEIGHT = 2;

/**
 * Negative terms Midjourney understands via `--no`.
 * Targets split/collage layouts and invented people on style-transfer.
 */
export const MIDJOURNEY_REF_NO_TERMS =
    'people, person, human, man, woman, girl, boy, child, face, collage, split panel, diptych, triptych, side by side, before and after, grid layout, comic panel, multiple panels, comparison';

/** Positive framing appended when image refs are present. */
export const MIDJOURNEY_REF_STYLE_HINT =
    'single full-frame image of the exact same subject from the reference photo only, no extra subjects';

const DEFAULT_REF_PROMPT =
    'reimagine the reference photo in the requested style, keep the exact same subject';

/**
 * Builds the Apiframe Midjourney imagine prompt:
 * `<imageUrls…> <user text>, <hint> --iw N --no … --q <q>`
 * Strips attachment manifesto / @image tags so MJ never sees bot meta-text.
 */
export function buildMidjourneyImaginePrompt(params: {
    imageUrls: readonly string[];
    rawPrompt?: string | null;
    qualityQ: string | number;
}): string {
    const { imageUrls, qualityQ } = params;
    const cleaned = stripAttachmentMentionManifest(params.rawPrompt ?? '')
        .replace(/@(?:image|video|file)\d+/gi, '')
        .replace(/\s--q\s+[\d.]+/gi, '')
        .replace(/\s--iw\s+[\d.]+/gi, '')
        // Strip a prior --no … block up to the next flag or end of string.
        .replace(/\s--no\b[\s\S]*?(?=\s--[a-z]|$)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    let textPart = cleaned || (imageUrls.length ? DEFAULT_REF_PROMPT : '');
    if (!textPart && !imageUrls.length) {
        throw new Error('Midjourney requires a prompt');
    }

    if (imageUrls.length) {
        textPart = textPart
            ? `${textPart}, ${MIDJOURNEY_REF_STYLE_HINT}`
            : MIDJOURNEY_REF_STYLE_HINT;
        return `${[...imageUrls, textPart].join(' ')} --iw ${MIDJOURNEY_REF_IMAGE_WEIGHT} --no ${MIDJOURNEY_REF_NO_TERMS} --q ${qualityQ}`;
    }

    return `${textPart} --q ${qualityQ}`;
}
