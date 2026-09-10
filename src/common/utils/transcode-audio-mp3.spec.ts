import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import { transcodeAudioToMp3 } from './transcode-audio-mp3';

async function ffmpegMake(
    args: string[],
    outputPath: string,
): Promise<Buffer> {
    await new Promise<void>((resolve, reject) => {
        const proc = spawn(
            'ffmpeg',
            ['-nostdin', '-y', ...args, outputPath],
            { stdio: 'ignore' },
        );
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exit ${code}`));
        });
    });
    return readFile(outputPath);
}

describe('transcodeAudioToMp3', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'endora-audio-spec-'));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('converts ogg/opus to mp3 quickly', async () => {
        const oggPath = join(dir, 'voice.ogg');
        const ogg = await ffmpegMake(
            [
                '-f',
                'lavfi',
                '-i',
                'anullsrc=r=48000:cl=mono',
                '-t',
                '0.25',
                '-c:a',
                'libopus',
            ],
            oggPath,
        );
        const started = Date.now();
        const out = await transcodeAudioToMp3(ogg, {
            mimeType: 'audio/ogg',
            fileName: 'voice.ogg',
        });
        expect(Date.now() - started).toBeLessThan(5_000);
        expect(out).not.toBe(ogg);
        expect(out.length).toBeGreaterThan(0);
        expect(out[0] === 0xff || out.toString('ascii', 0, 3) === 'ID3').toBe(
            true,
        );
    });

    it('skips wav without ffmpeg', async () => {
        const wavPath = join(dir, 'sample.wav');
        const wav = await ffmpegMake(
            [
                '-f',
                'lavfi',
                '-i',
                'anullsrc=r=44100:cl=mono',
                '-t',
                '0.25',
            ],
            wavPath,
        );
        const out = await transcodeAudioToMp3(wav, {
            mimeType: 'audio/wav',
            fileName: 'sample.wav',
        });
        expect(out).toBe(wav);
    });

    it('skips mp3 without ffmpeg', async () => {
        const mp3Path = join(dir, 'sample.mp3');
        const mp3 = await ffmpegMake(
            [
                '-f',
                'lavfi',
                '-i',
                'anullsrc=r=44100:cl=mono',
                '-t',
                '0.25',
                '-c:a',
                'libmp3lame',
            ],
            mp3Path,
        );
        const out = await transcodeAudioToMp3(mp3, {
            mimeType: 'audio/mpeg',
            fileName: 'sample.mp3',
        });
        expect(out).toBe(mp3);
    });
});
