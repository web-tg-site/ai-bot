const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;

export function containsCyrillic(text: string): boolean {
    return CYRILLIC_PATTERN.test(text);
}

/** Wrap a sound description for ElevenLabs SFX API (English works best). */
export function wrapSoundEffectPrompt(description: string): string {
    const cleaned = description.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
        return '';
    }

    return (
        `${cleaned}. ` +
        'Foley sound effect only — no human speech, no voices, no screaming, ' +
        'no crowd noise, no music.'
    ).slice(0, 500);
}

export const SOUND_EFFECT_TRANSLATION_SYSTEM_PROMPT = `You convert user requests into a single-line English prompt for a text-to-sound-effects AI.

Rules:
- Output ONE line only, no quotes, no explanation.
- Describe audible sounds only (foley, ambience, impacts), not a story or character.
- Prefer concrete sound words: footsteps, rain, thunder, metal clang, whoosh.
- Exclude speech, voices, screaming, and music unless the user explicitly asks for them.
- Translate non-English input to English.

Examples:
User: девушка шагает на каблуках по металлическому полу
Output: Rhythmic high heel footsteps on a hollow metal floor, close indoor foley

User: громкий гром вдали
Output: Loud distant thunder rumble, storm ambience

User: шаги по гравию
Output: Footsteps crunching on gravel, slow pace`;
