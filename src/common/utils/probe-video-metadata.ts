import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const PROBE_TIMEOUT_MS = 20_000;

export type VideoMetadata = {
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    fps: number | null;
};

async function runFfprobe(args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
        const proc = spawn('ffprobe', args, {
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        let stdout = '';
        proc.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8');
        });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve(null);
        }, PROBE_TIMEOUT_MS);

        proc.on('error', () => {
            clearTimeout(timer);
            resolve(null);
        });
        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve(code === 0 ? stdout : null);
        });
    });
}

/** `24/1` and `30000/1001` are both valid ffprobe frame-rate forms. */
function parseFrameRate(raw: string): number | null {
    const [num, den] = raw.split('/').map(Number);
    if (!num || !den) {
        return Number.isFinite(num) && num > 0 ? num : null;
    }
    const fps = num / den;
    return Number.isFinite(fps) && fps > 0 ? fps : null;
}

function toPositiveNumber(raw: string | undefined): number | null {
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Best-effort probe of a video buffer. Returns nulls instead of throwing when
 * ffprobe is unavailable or the container is unreadable, so callers can treat
 * missing metadata as "cannot verify" rather than "invalid".
 */
export async function probeVideoMetadata(
    buffer: Buffer,
    fileName?: string,
): Promise<VideoMetadata> {
    const empty: VideoMetadata = {
        durationSeconds: null,
        width: null,
        height: null,
        fps: null,
    };

    let dir: string | undefined;
    try {
        dir = await mkdtemp(join(tmpdir(), 'probe-'));
        const suffix = /\.(mov|mp4|webm|m4v)$/i.exec(fileName ?? '')?.[0] ?? '.mp4';
        const path = join(dir, `input${suffix}`);
        await writeFile(path, buffer);

        const stdout = await runFfprobe([
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height,r_frame_rate:format=duration',
            '-of',
            'default=noprint_wrappers=1',
            path,
        ]);
        if (!stdout) {
            return empty;
        }

        const fields = new Map<string, string>();
        for (const line of stdout.split('\n')) {
            const sep = line.indexOf('=');
            if (sep > 0) {
                fields.set(line.slice(0, sep).trim(), line.slice(sep + 1).trim());
            }
        }

        const rawFps = fields.get('r_frame_rate');
        return {
            durationSeconds: toPositiveNumber(fields.get('duration')),
            width: toPositiveNumber(fields.get('width')),
            height: toPositiveNumber(fields.get('height')),
            fps: rawFps ? parseFrameRate(rawFps) : null,
        };
    } catch {
        return empty;
    } finally {
        if (dir) {
            await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}
