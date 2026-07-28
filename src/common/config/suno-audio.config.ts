import { AiToolId } from '@/common/services/ai/types';

export const SUNO_DURATIONS = [30, 60, 120] as const;

export type SunoDurationSeconds = (typeof SUNO_DURATIONS)[number];

export function isSunoTool(toolId: AiToolId): boolean {
    return toolId === AiToolId.SUNO;
}

export function normalizeSunoDuration(
    durationSeconds?: number,
): SunoDurationSeconds {
    if (
        durationSeconds &&
        (SUNO_DURATIONS as readonly number[]).includes(durationSeconds)
    ) {
        return durationSeconds as SunoDurationSeconds;
    }

    if (durationSeconds) {
        return SUNO_DURATIONS.reduce((closest, value) =>
            Math.abs(value - durationSeconds) <
            Math.abs(closest - durationSeconds)
                ? value
                : closest,
        );
    }

    return 30;
}
