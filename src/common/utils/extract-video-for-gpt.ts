import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const FFMPEG_TIMEOUT_MS = 60_000;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_FRAMES = 12;
const MIN_FRAMES = 4;
const FRAME_MAX_DIM = 768;
const AUDIO_MAX_SECONDS = 180;

export const FFMPEG_MISSING_ERROR =
    'Для анализа видео нужен ffmpeg. Он не установлен на сервере.';

export type GptVideoFrame = {
    buffer: Buffer;
    mimeType: 'image/jpeg';
    timestampSec: number;
};

export type GptVideoExtraction = {
    frames: GptVideoFrame[];
    audio?: Buffer;
    durationSec: number;
};

export async function extractVideoForGpt(
    buffer: Buffer,
    options?: { mimeType?: string; fileName?: string },
): Promise<GptVideoExtraction> {
    if (buffer.byteLength > MAX_VIDEO_BYTES) {
        throw new Error('Видео слишком большое. Максимум 100 МБ.');
    }

    const dir = await mkdtemp(join(tmpdir(), 'endora-gpt-vid-'));
    const inputPath = join(dir, `in.${guessVideoExt(options)}`);

    try {
        await writeFile(inputPath, buffer);
        const durationSec = await probeDuration(inputPath);
        const timestamps = pickFrameTimestamps(durationSec);
        const frames = await extractFrames(inputPath, dir, timestamps);
        const audio = await extractAudio(inputPath, dir);

        if (!frames.length) {
            throw new Error('Не удалось извлечь кадры из видео.');
        }

        return { frames, audio, durationSec };
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

function guessVideoExt(options?: {
    mimeType?: string;
    fileName?: string;
}): string {
    const name = options?.fileName?.toLowerCase() ?? '';
    if (name.endsWith('.mov')) return 'mov';
    if (name.endsWith('.webm')) return 'webm';
    if (name.endsWith('.mkv')) return 'mkv';
    if (name.endsWith('.m4v')) return 'm4v';
    const mime = options?.mimeType?.toLowerCase() ?? '';
    if (mime.includes('quicktime')) return 'mov';
    if (mime.includes('webm')) return 'webm';
    return 'mp4';
}

function pickFrameTimestamps(durationSec: number): number[] {
    const safeDuration =
        Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 8;
    const count =
        safeDuration <= 8
            ? Math.max(
                  MIN_FRAMES,
                  Math.min(MAX_FRAMES, Math.ceil(safeDuration)),
              )
            : MAX_FRAMES;

    const timestamps: number[] = [];
    for (let i = 0; i < count; i += 1) {
        const t = ((i + 0.5) / count) * safeDuration;
        timestamps.push(Math.max(0, Math.min(safeDuration - 0.05, t)));
    }
    return timestamps;
}

async function probeDuration(inputPath: string): Promise<number> {
    try {
        const { stdout } = await runProcess(
            'ffprobe',
            [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                inputPath,
            ],
            15_000,
        );
        const duration = Number.parseFloat(stdout.trim());
        return Number.isFinite(duration) && duration > 0 ? duration : 8;
    } catch (error) {
        if (isFfmpegMissing(error)) {
            throw new Error(FFMPEG_MISSING_ERROR);
        }
        return 8;
    }
}

async function extractFrames(
    inputPath: string,
    dir: string,
    timestamps: number[],
): Promise<GptVideoFrame[]> {
    const frames: GptVideoFrame[] = [];

    for (let i = 0; i < timestamps.length; i += 1) {
        const timestampSec = timestamps[i];
        const outputPath = join(dir, `frame-${i}.jpg`);
        try {
            await runProcess(
                'ffmpeg',
                [
                    '-y',
                    '-ss',
                    timestampSec.toFixed(3),
                    '-i',
                    inputPath,
                    '-frames:v',
                    '1',
                    '-vf',
                    `scale='min(${FRAME_MAX_DIM},iw)':-2`,
                    '-q:v',
                    '5',
                    outputPath,
                ],
                FFMPEG_TIMEOUT_MS,
            );
            frames.push({
                buffer: await readFile(outputPath),
                mimeType: 'image/jpeg',
                timestampSec,
            });
        } catch (error) {
            if (isFfmpegMissing(error)) {
                throw new Error(FFMPEG_MISSING_ERROR);
            }
        }
    }

    return frames;
}

async function extractAudio(
    inputPath: string,
    dir: string,
): Promise<Buffer | undefined> {
    const outputPath = join(dir, 'audio.mp3');
    try {
        await runProcess(
            'ffmpeg',
            [
                '-y',
                '-i',
                inputPath,
                '-vn',
                '-ac',
                '1',
                '-ar',
                '16000',
                '-t',
                String(AUDIO_MAX_SECONDS),
                '-c:a',
                'libmp3lame',
                '-q:a',
                '5',
                outputPath,
            ],
            FFMPEG_TIMEOUT_MS,
        );
        const audio = await readFile(outputPath);
        return audio.byteLength > 0 ? audio : undefined;
    } catch (error) {
        if (isFfmpegMissing(error)) {
            throw new Error(FFMPEG_MISSING_ERROR);
        }
        return undefined;
    }
}

function isFfmpegMissing(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.message === 'FFMPEG_MISSING' ||
            error.message === FFMPEG_MISSING_ERROR)
    );
}

function runProcess(
    command: string,
    args: string[],
    timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args);
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        proc.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error(`${command} timeout`));
        }, timeoutMs);

        proc.on('error', (error) => {
            clearTimeout(timer);
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                reject(new Error('FFMPEG_MISSING'));
                return;
            }
            reject(error);
        });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }
            reject(
                new Error(
                    `${command} exited with ${code}: ${stderr.slice(0, 400)}`,
                ),
            );
        });
    });
}
