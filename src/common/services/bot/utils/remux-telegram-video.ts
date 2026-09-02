import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';

/**
 * Remux/transcode to H.264 + AAC with faststart so Telegram can preview
 * HEVC / non-faststart MP4. Returns the original buffer if ffmpeg fails.
 */
export async function remuxVideoForTelegram(buffer: Buffer): Promise<Buffer> {
    return transcodeVideoToH264(buffer, {
        softFail: true,
        force: true,
        timeoutMs: 60_000,
    });
}
