import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';

/** OpenAI Sora characters: short clip, typically 2–4 seconds. */
const MAX_CHARACTER_SECONDS = 4;

/**
 * Transcode any phone/camera clip to MP4 H.264 + optional AAC.
 * Many “.mp4” uploads are HEVC/H.265 or odd containers and get rejected by OpenAI.
 */
export async function transcodeVideoForSoraCharacter(
    buffer: Buffer,
): Promise<Buffer> {
    try {
        return await transcodeVideoToH264(buffer, {
            maxSeconds: MAX_CHARACTER_SECONDS,
            force: true,
            timeoutMs: 90_000,
        });
    } catch {
        throw new Error(
            'Не удалось подготовить видео для персонажа Sora. Загрузите клип 2–4 сек в MP4 или MOV.',
        );
    }
}
