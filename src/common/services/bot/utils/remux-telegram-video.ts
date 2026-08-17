import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const FFMPEG_TIMEOUT_MS = 60_000;

/**
 * Remux/transcode to H.264 + AAC with faststart so Telegram can preview
 * HEVC / non-faststart MP4. Returns the original buffer if ffmpeg is missing.
 */
export async function remuxVideoForTelegram(buffer: Buffer): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'endora-vid-'));
    const inputPath = join(dir, 'in.mp4');
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

        return await readFile(outputPath);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
