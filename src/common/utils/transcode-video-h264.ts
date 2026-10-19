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
    /**
     * Scale so every side is within [minSide, maxSide] (aspect preserved, no crop).
     * Upscales undersized clips and downscales oversized ones.
     */
    fitSideRange?: { minSide: number; maxSide: number };
    /** libx264 quality. Lower is larger/better. Default ffmpeg CRF is 23. */
    crf?: number;
    /** Constant output frame rate. Phone clips are often variable and Kling cannot decode them. */
    fps?: number;
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
 * Scale using iw/ih inside ffmpeg. Those are the dimensions after autorotate,
 * so a sideways iPhone frame is measured as the viewer sees it. Probing the
 * coded size (3840x2160 plus a 90° tag) and then scaling to that size squishes
 * the portrait after rotation.
 * Commas are escaped because they also separate -vf filters.
 */
function fitSideScaleFilter(minSide: number, maxSide: number): string {
    const min = String(minSide);
    const max = String(maxSide);
    const factor = [
        'if(gt(max(iw\\,ih)*if(lt(min(iw\\,ih)\\,',
        min,
        ')\\,',
        min,
        '/min(iw\\,ih)\\,1)\\,',
        max,
        ')\\,',
        max,
        '/max(iw\\,ih)\\,if(lt(min(iw\\,ih)\\,',
        min,
        ')\\,',
        min,
        '/min(iw\\,ih)\\,1))',
    ].join('');
    return `scale=w='trunc(iw*${factor}/2)*2':h='trunc(ih*${factor}/2)*2'`;
}

/** iPhone Dolby Vision leaves a dby1 brand even after an SDR re-encode. */
function stripDolbyVisionBrand(buffer: Buffer): Buffer {
    const marker = Buffer.from('dby1');
    const idx = buffer.indexOf(marker);
    if (idx < 0 || idx > 128) {
        return buffer;
    }
    const out = Buffer.from(buffer);
    out.write('isom', idx, 'ascii');
    return out;
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

        const scaleFilter = options.fitSideRange
            ? fitSideScaleFilter(
                  options.fitSideRange.minSide,
                  options.fitSideRange.maxSide,
              )
            : null;

        if (!force && options.maxSeconds == null && !scaleFilter) {
            const compatible = await isProviderCompatibleH264(inputPath);
            if (compatible) {
                return buffer;
            }
        }

        const args = ['-y', '-i', inputPath];
        if (options.maxSeconds != null && options.maxSeconds > 0) {
            args.push('-t', String(options.maxSeconds));
        }
        args.push('-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1');
        // yuv420p needs even sides. Identity for already-even frames.
        const filters = [
            scaleFilter,
            'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        ].filter((part): part is string => Boolean(part));
        args.push('-vf', filters.join(','));
        if (options.fps != null && options.fps > 0) {
            args.push('-r', String(options.fps));
        }
        args.push(
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            // 8-bit output still inherited bt2020/HLG tags from iPhone HDR,
            // and Kling Motion then dies with “Other undefined errors”.
            '-color_primaries',
            'bt709',
            '-color_trc',
            'bt709',
            '-colorspace',
            'bt709',
            '-color_range',
            'tv',
        );
        if (options.crf != null && Number.isFinite(options.crf)) {
            args.push('-crf', String(Math.round(options.crf)));
        }
        args.push(
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

        const out = stripDolbyVisionBrand(await readFile(outputPath));
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
