import { AiToolId } from '@/common/services/ai/types';

/** ElevenLabs text-to-sound supports 0.5–22 seconds. */
export const SOUND_GENERATOR_DURATIONS = [5, 10, 15, 22] as const;

export type SoundGeneratorDurationSeconds =
    (typeof SOUND_GENERATOR_DURATIONS)[number];

export function isSoundGeneratorTool(toolId: AiToolId): boolean {
    return toolId === AiToolId.SOUND_GENERATOR;
}

export function normalizeSoundGeneratorDuration(
    durationSeconds?: number,
): SoundGeneratorDurationSeconds {
    if (
        durationSeconds &&
        (SOUND_GENERATOR_DURATIONS as readonly number[]).includes(
            durationSeconds,
        )
    ) {
        return durationSeconds as SoundGeneratorDurationSeconds;
    }

    if (durationSeconds) {
        return SOUND_GENERATOR_DURATIONS.reduce((closest, value) =>
            Math.abs(value - durationSeconds) <
            Math.abs(closest - durationSeconds)
                ? value
                : closest,
        );
    }

    return 5;
}
