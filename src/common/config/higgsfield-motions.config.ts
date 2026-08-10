/**
 * Popular Higgsfield DoP motion/effect names for Telegram bot picker.
 * Resolved to live UUIDs via GET /v1/motions by case-insensitive name match.
 */
export const HIGGSFIELD_CURATED_MOTION_NAMES = [
    'Earth Zoom Out',
    'Zoom In',
    'Zoom Out',
    'Eyes In',
    'Turning Metal',
    'Melting',
    'Building Explosion',
    'Explosion',
    'Face Punch',
    'Diamond Duplicate',
    'Roll Transition',
    'Glitch',
    'Flame On',
    'Fire Element',
    'Water Bending',
    'Air Bending',
    'Levitation',
    'Hero Flight',
    'I Can Fly',
    'Money Rain',
    'Sakura Petals',
    'Smoke Transition',
    'Thunder God',
    'Cyborg',
    'Disintegration',
    'Black Tears',
    'Clone Explosion',
    'Color Rain',
    'Balloon',
    'Animalization',
] as const;

export const HIGGSFIELD_NO_MOTION_ID = 'none';

export const DEFAULT_HIGGSFIELD_MOTION_STRENGTH = 0.8;

export type HiggsfieldMotionOption = {
    id: string;
    name: string;
    category?: string | null;
    previewUrl?: string | null;
};

export function filterCuratedHiggsfieldMotions(
    motions: HiggsfieldMotionOption[],
): HiggsfieldMotionOption[] {
    const byName = new Map(
        motions.map((motion) => [motion.name.trim().toLowerCase(), motion]),
    );

    const curated: HiggsfieldMotionOption[] = [];
    for (const name of HIGGSFIELD_CURATED_MOTION_NAMES) {
        const match = byName.get(name.toLowerCase());
        if (match) {
            curated.push(match);
        }
    }

    return curated;
}
