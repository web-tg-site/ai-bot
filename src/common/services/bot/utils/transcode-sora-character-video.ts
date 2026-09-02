import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';

/** OpenAI Sora characters: short clip, typically 2–4 seconds. */
const MAX_CHARACTER_SECONDS = 4;
const MIN_CHARACTER_SECONDS = 1.8;
const FFMPEG_TIMEOUT_MS = 90_000;

type VideoProbe = {
    width: number;
    height: number;
    duration: number;
};

async function runProcess(
    command: string,
    args: string[],
    timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8');
        });
        proc.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf8');
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
            resolve({ code, stdout, stderr });
        });
    });
}

async function probeVideo(inputPath: string): Promise<VideoProbe | null> {
    try {
        const size = await runProcess(
            'ffprobe',
            [
                '-v',
                'error',
                '-select_streams',
                'v:0',
                '-show_entries',
                'stream=width,height',
                '-of',
                'csv=p=0:s=x',
                inputPath,
            ],
            15_000,
        );
        const durationResult = await runProcess(
            'ffprobe',
            [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'csv=p=0',
                inputPath,
            ],
            15_000,
        );
        if (size.code !== 0 || durationResult.code !== 0) {
            return null;
        }
        const [widthRaw, heightRaw] = size.stdout.trim().split('x');
        const width = Number(widthRaw);
        const height = Number(heightRaw);
        const duration = Number(durationResult.stdout.trim());
        if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            !Number.isFinite(duration) ||
            width <= 0 ||
            height <= 0 ||
            duration <= 0
        ) {
            return null;
        }
        return { width, height, duration };
    } catch {
        return null;
    }
}

async function scaleToSoraCharacterSpec(
    inputPath: string,
    outputPath: string,
    probe: VideoProbe,
): Promise<void> {
    const landscape = probe.width >= probe.height;
    const targetW = landscape ? 1280 : 720;
    const targetH = landscape ? 720 : 1280;
    const vf = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

    const result = await runProcess(
        'ffmpeg',
        [
            '-y',
            '-i',
            inputPath,
            '-t',
            String(MAX_CHARACTER_SECONDS),
            '-vf',
            vf,
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
        FFMPEG_TIMEOUT_MS,
    );
    if (result.code !== 0) {
        throw new Error('ffmpeg scale failed');
    }
}

/**
 * Transcode phone clips to MP4 H.264 and normalize to Sora character specs:
 * 2–4 s, 720p, 16:9 or 9:16.
 */
export async function transcodeVideoForSoraCharacter(
    buffer: Buffer,
): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'sora-char-'));
    const rawPath = join(dir, 'raw.mp4');
    const scaledPath = join(dir, 'out.mp4');

    try {
        const h264 = await transcodeVideoToH264(buffer, {
            maxSeconds: MAX_CHARACTER_SECONDS,
            force: true,
            timeoutMs: FFMPEG_TIMEOUT_MS,
        });
        await writeFile(rawPath, h264);

        const probe = await probeVideo(rawPath);
        if (probe && probe.duration < MIN_CHARACTER_SECONDS) {
            throw new Error(
                `Клип слишком короткий (${probe.duration.toFixed(1)} с). Нужно 2–4 секунды.`,
            );
        }

        if (probe) {
            await scaleToSoraCharacterSpec(rawPath, scaledPath, probe);
            const out = await readFile(scaledPath);
            if (!out.length) {
                throw new Error('empty output');
            }
            return out;
        }

        return h264;
    } catch (error) {
        if (error instanceof Error && /[а-яА-ЯёЁ]/.test(error.message)) {
            throw error;
        }
        throw new Error(
            'Не удалось подготовить видео для персонажа Sora. Загрузите клип 2–4 сек в MP4 или MOV.',
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
