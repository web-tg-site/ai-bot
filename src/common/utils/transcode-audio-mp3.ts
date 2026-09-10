import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const DEFAULT_TIMEOUT_MS = 60_000;

export type TranscodeAudioToMp3Options = {
    /** On ffmpeg failure return the original buffer instead of throwing. */
    softFail?: boolean;
    /** Always run ffmpeg even when probe says MP3/WAV. */
    force?: boolean;
    timeoutMs?: number;
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

/**
 * HeyGen Assets API and several other providers accept MP3/WAV reliably.
 * Telegram voice (OGG/Opus), M4A, AAC, FLAC, WebM, etc. need conversion.
 */
async function isProviderCompatibleMp3OrWav(
    inputPath: string,
): Promise<boolean> {
    try {
        const probe = await runProcess(
            'ffprobe',
            [
                '-v',
                'error',
                '-select_streams',
                'a:0',
                '-show_entries',
                'stream=codec_name:format=format_name',
                '-of',
                'json',
                inputPath,
            ],
            15_000,
        );
        if (probe.code !== 0 || !probe.stdout.trim()) {
            return false;
        }
        const parsed = JSON.parse(probe.stdout) as {
            streams?: Array<{ codec_name?: string }>;
            format?: { format_name?: string };
        };
        const codec = (parsed.streams?.[0]?.codec_name ?? '')
            .trim()
            .toLowerCase();
        const formatName = (parsed.format?.format_name ?? '')
            .trim()
            .toLowerCase();
        if (!codec) {
            return false;
        }
        if (codec === 'mp3' && formatName.includes('mp3')) {
            return true;
        }
        if (
            formatName.includes('wav') &&
            (codec.startsWith('pcm_') || codec === 'pcm')
        ) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Transcode inbound audio to MP3 (libmp3lame) so providers that only accept
 * MP3/WAV (notably HeyGen) get a usable asset. Skips when already MP3/WAV.
 */
export async function transcodeAudioToMp3(
    buffer: Buffer,
    options: TranscodeAudioToMp3Options = {},
): Promise<Buffer> {
    const softFail = options.softFail === true;
    const force = options.force === true;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const dir = await mkdtemp(join(tmpdir(), 'endora-audio-'));
    const inputPath = join(dir, 'in.bin');
    const outputPath = join(dir, 'out.mp3');

    try {
        await writeFile(inputPath, buffer);

        if (!force) {
            const compatible = await isProviderCompatibleMp3OrWav(inputPath);
            if (compatible) {
                return buffer;
            }
        }

        const result = await runProcess(
            'ffmpeg',
            [
                '-y',
                '-i',
                inputPath,
                '-vn',
                '-c:a',
                'libmp3lame',
                '-q:a',
                '2',
                '-ac',
                '2',
                '-ar',
                '44100',
                outputPath,
            ],
            timeoutMs,
        );
        if (result.code !== 0) {
            throw new Error(`ffmpeg exited with ${result.code}`);
        }

        const out = await readFile(outputPath);
        if (!out.length) {
            throw new Error('empty audio transcode output');
        }
        return out;
    } catch (error) {
        if (softFail) {
            return buffer;
        }
        const detail =
            error instanceof Error ? error.message : 'unknown ffmpeg error';
        throw new Error(
            `Не удалось подготовить аудио (${detail}). Загрузите файл в MP3 или WAV.`,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
