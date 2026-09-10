import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/** Speech-sized jobs should finish in seconds, not minutes. */
const DEFAULT_TIMEOUT_MS = 20_000;

const MP3_MIME = /^(audio\/mpeg|audio\/mp3)$/i;
const WAV_MIME = /^(audio\/wav|audio\/x-wav|audio\/wave|audio\/vnd\.wave)$/i;
const MP3_EXT = /\.mp3$/i;
const WAV_EXT = /\.wav$/i;

/** Formats we always re-encode (Telegram voice, phone recordings, etc.). */
const NEEDS_CONVERT_MIME =
    /^(audio\/ogg|application\/ogg|audio\/opus|audio\/webm|audio\/mp4|audio\/m4a|audio\/aac|audio\/x-m4a|audio\/flac|audio\/x-flac|audio\/x-ms-wma|audio\/amr|audio\/aiff|audio\/x-aiff|audio\/x-caf)$/i;
const NEEDS_CONVERT_EXT =
    /\.(ogg|oga|opus|webm|m4a|aac|flac|wma|caf|aiff?|amr)$/i;

export type TranscodeAudioToMp3Options = {
    /** On ffmpeg failure return the original buffer instead of throwing. */
    softFail?: boolean;
    /** Always run ffmpeg even when mime/ext says MP3/WAV. */
    force?: boolean;
    timeoutMs?: number;
};

function isAlreadyMp3OrWav(mimeType?: string, fileName?: string): boolean {
    if (mimeType && (MP3_MIME.test(mimeType) || WAV_MIME.test(mimeType))) {
        return true;
    }
    if (fileName && (MP3_EXT.test(fileName) || WAV_EXT.test(fileName))) {
        return true;
    }
    return false;
}

function clearlyNeedsConvert(mimeType?: string, fileName?: string): boolean {
    if (mimeType && NEEDS_CONVERT_MIME.test(mimeType)) {
        return true;
    }
    if (fileName && NEEDS_CONVERT_EXT.test(fileName)) {
        return true;
    }
    return false;
}

function inputFileName(mimeType?: string, fileName?: string): string {
    const fromName = fileName?.match(/\.(\w+)$/i)?.[1]?.toLowerCase();
    if (fromName && /^[a-z0-9]+$/i.test(fromName)) {
        return `in.${fromName}`;
    }
    const mime = mimeType?.toLowerCase() ?? '';
    if (mime.includes('ogg') || mime.includes('opus')) return 'in.ogg';
    if (mime.includes('webm')) return 'in.webm';
    if (mime.includes('mp4') || mime.includes('m4a')) return 'in.m4a';
    if (mime.includes('aac')) return 'in.aac';
    if (mime.includes('flac')) return 'in.flac';
    if (mime.includes('wav')) return 'in.wav';
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'in.mp3';
    return 'in.audio';
}

async function runProcess(
    command: string,
    args: string[],
    timeoutMs: number,
): Promise<{ code: number | null }> {
    return new Promise((resolve, reject) => {
        // Ignore stderr like video transcoder — avoids pipe-buffer stalls.
        const proc = spawn(command, args, {
            stdio: ['ignore', 'ignore', 'ignore'],
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
            resolve({ code });
        });
    });
}

/**
 * Transcode inbound audio to MP3 so providers that only accept MP3/WAV
 * (notably HeyGen) get a usable asset.
 *
 * Fast path: skip when mime/name is already MP3 or WAV.
 * Encode as speech-friendly mono 48kbps — seconds even for long clips.
 */
export async function transcodeAudioToMp3(
    buffer: Buffer,
    options: TranscodeAudioToMp3Options & {
        mimeType?: string;
        fileName?: string;
    } = {},
): Promise<Buffer> {
    const softFail = options.softFail === true;
    const force = options.force === true;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (
        !force &&
        isAlreadyMp3OrWav(options.mimeType, options.fileName) &&
        !clearlyNeedsConvert(options.mimeType, options.fileName)
    ) {
        return buffer;
    }

    const dir = await mkdtemp(join(tmpdir(), 'endora-audio-'));
    const inputPath = join(
        dir,
        inputFileName(options.mimeType, options.fileName),
    );
    const outputPath = join(dir, 'out.mp3');

    try {
        await writeFile(inputPath, buffer);

        const result = await runProcess(
            'ffmpeg',
            [
                '-nostdin',
                '-hide_banner',
                '-loglevel',
                'error',
                '-y',
                '-i',
                inputPath,
                '-vn',
                '-c:a',
                'libmp3lame',
                // Speech / avatar voice: fast and small (not hi-fi music).
                '-b:a',
                '64k',
                '-ac',
                '1',
                '-ar',
                '24000',
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
