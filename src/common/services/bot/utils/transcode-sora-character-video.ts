import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const FFMPEG_TIMEOUT_MS = 90_000;
/** OpenAI Sora characters: short clip, typically 2–4 seconds. */
const MAX_CHARACTER_SECONDS = 4;

/**
 * Transcode any phone/camera clip to MP4 H.264 + optional AAC.
 * Many “.mp4” uploads are HEVC/H.265 or odd containers and get rejected by OpenAI.
 */
export async function transcodeVideoForSoraCharacter(
    buffer: Buffer,
): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'sora-char-'));
    const inputPath = join(dir, 'in.bin');
    const outputPath = join(dir, 'out.mp4');

    try {
        await writeFile(inputPath, buffer);

        await new Promise<void>((resolve, reject) => {
            const proc = spawn(
                'ffmpeg',
                [
                    '-y',
                    '-i',
                    inputPath,
                    '-t',
                    String(MAX_CHARACTER_SECONDS),
                    '-map',
                    '0:v:0',
                    '-map',
                    '0:a:0?',
                    '-c:v',
                    'libx264',
                    '-pix_fmt',
                    'yuv420p',
                    '-c:a',
                    'aac',
                    '-ac',
                    '2',
                    '-movflags',
                    '+faststart',
                    '-preset',
                    'veryfast',
                    outputPath,
                ],
                { stdio: 'ignore' },
            );

            const timer = setTimeout(() => {
                proc.kill('SIGKILL');
                reject(new Error('ffmpeg timeout'));
            }, FFMPEG_TIMEOUT_MS);

            proc.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
            proc.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(`ffmpeg exited with ${code}`));
            });
        });

        const out = await readFile(outputPath);
        if (!out.length) {
            throw new Error('empty transcode output');
        }
        return out;
    } catch (error) {
        const detail =
            error instanceof Error ? error.message : 'unknown ffmpeg error';
        throw new Error(
            `Не удалось подготовить видео для персонажа Sora (${detail}). Загрузите клип 2–4 сек в MP4 или MOV.`,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
