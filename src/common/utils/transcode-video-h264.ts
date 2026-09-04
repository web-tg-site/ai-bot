import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const DEFAULT_TIMEOUT_MS = 120_000;

export type TranscodeVideoToH264Options = {
    /** Truncate output to at most N seconds (provider duration limits). */
    maxSeconds?: number;
    /** On ffmpeg failure return the original buffer instead of throwing. */
    softFail?: boolean;
    /** Always run ffmpeg (Telegram delivery needs faststart even for H.264). */
    force?: boolean;
    timeoutMs?: number;
};

async function runProcess(
    command: string,
    args: string[],
    timeoutMs: number,
): Promise<{ code: number | null; stdout: string }> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        let stdout = '';
        proc.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8');
        });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error(`${command} timeout`));
        }, timeoutMs);

        proc.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout });
        });
    });
}

async function isProviderCompatibleH264(inputPath: string): Promise<boolean> {
    try {
        const video = await runProcess(
            'ffprobe',
            [
                '-v',
                'error',
                '-select_streams',
                'v:0',
                '-show_entries',
                'stream=codec_name',
                '-of',
                'csv=p=0',
                inputPath,
            ],
            15_000,
        );
        if (video.code !== 0) {
            return false;
        }
        const videoCodec = video.stdout.trim().toLowerCase();
        if (videoCodec !== 'h264') {
            return false;
        }

        const audio = await runProcess(
            'ffprobe',
            [
                '-v',
                'error',
                '-select_streams',
                'a:0',
                '-show_entries',
                'stream=codec_name',
                '-of',
                'csv=p=0',
                inputPath,
            ],
            15_000,
        );
        // No audio stream is fine (optional AAC for many providers).
        if (audio.code !== 0 || !audio.stdout.trim()) {
            return true;
        }
        const audioCodec = audio.stdout.trim().toLowerCase();
        return audioCodec === 'aac';
    } catch {
        return false;
    }
}

/**
 * Transcode phone/camera clips to MP4 H.264 + optional AAC + faststart.
 * Many iPhone “.mp4” uploads are HEVC and get rejected by providers.
 */
export async function transcodeVideoToH264(
    buffer: Buffer,
    options: TranscodeVideoToH264Options = {},
): Promise<Buffer> {
    const softFail = options.softFail === true;
    const force = options.force === true;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const dir = await mkdtemp(join(tmpdir(), 'endora-h264-'));
    const inputPath = join(dir, 'in.bin');
    const outputPath = join(dir, 'out.mp4');

    try {
        await writeFile(inputPath, buffer);

        if (!force && options.maxSeconds == null) {
            const compatible = await isProviderCompatibleH264(inputPath);
            if (compatible) {
                return buffer;
            }
        }

        const args = ['-y', '-i', inputPath];
        if (options.maxSeconds != null && options.maxSeconds > 0) {
            args.push('-t', String(options.maxSeconds));
        }
        args.push(
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
        );

        const result = await runProcess('ffmpeg', args, timeoutMs);
        if (result.code !== 0) {
            throw new Error(`ffmpeg exited with ${result.code}`);
        }

        const out = await readFile(outputPath);
        if (!out.length) {
            throw new Error('empty transcode output');
        }
        return out;
    } catch (error) {
        if (softFail) {
            return buffer;
        }
        const detail =
            error instanceof Error ? error.message : 'unknown ffmpeg error';
        throw new Error(
            `Не удалось подготовить видео (${detail}). Загрузите клип в MP4 или MOV.`,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
