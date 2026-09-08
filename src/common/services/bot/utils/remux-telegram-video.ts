import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';

/** Bot API hard cap is 50 MB; leave headroom for multipart overhead. */
const TELEGRAM_VIDEO_MAX_BYTES = 45 * 1024 * 1024;
const TELEGRAM_REMUX_TIMEOUT_MS = 180_000;

/**
 * Remux/transcode to H.264 + AAC with faststart so Telegram can preview
 * HEVC / 4K / non-faststart MP4. Downscales oversized upscales (Topaz ×4/×6)
 * so the upload finishes instead of dying mid-file.
 */
export async function remuxVideoForTelegram(buffer: Buffer): Promise<Buffer> {
    const attempts: Array<{ maxSide: number; crf: number }> = [
        { maxSide: 1920, crf: 23 },
        { maxSide: 1920, crf: 28 },
        { maxSide: 1280, crf: 28 },
    ];

    let smallest: Buffer | null = null;
    for (const attempt of attempts) {
        try {
            const out = await transcodeVideoToH264(buffer, {
                force: true,
                crf: attempt.crf,
                timeoutMs: TELEGRAM_REMUX_TIMEOUT_MS,
                fitSideRange: { minSide: 64, maxSide: attempt.maxSide },
            });
            if (out.length > 0 && (!smallest || out.length < smallest.length)) {
                smallest = out;
            }
            if (out.length > 0 && out.length <= TELEGRAM_VIDEO_MAX_BYTES) {
                return out;
            }
        } catch {
            continue;
        }
    }

    if (smallest) {
        return smallest;
    }

    return transcodeVideoToH264(buffer, {
        softFail: true,
        force: true,
        timeoutMs: TELEGRAM_REMUX_TIMEOUT_MS,
    });
}
