import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { of } from 'rxjs';
import { AiToolId } from '../types';
import { LumaProvider } from './luma.provider';

describe('Luma Ray video requests', () => {
    const start = { mimeType: 'image/jpeg', buffer: Buffer.from('start') };
    const end = { mimeType: 'image/png', buffer: Buffer.from('end') };
    const startRef = {
        media_type: start.mimeType,
        data: start.buffer.toString('base64'),
    };
    const endRef = {
        media_type: end.mimeType,
        data: end.buffer.toString('base64'),
    };

    async function send(durationSeconds: number, files = [start, end]) {
        const post = jest
            .fn()
            .mockReturnValue(of({ data: { id: 'luma-job' } }));
        const provider = new LumaProvider(
            { post } as unknown as HttpService,
            new ConfigService({ LUMA_API_KEY: 'test-key' }),
            {} as PinoLogger,
        );
        await provider.createJob(AiToolId.LUMA_RAY, {
            prompt: 'Camera pans left',
            durationSeconds,
            files,
        });
        return post;
    }

    it.each([
        { files: [start], keyframes: [startRef], keyframe_indexes: [0] },
        {
            files: [start, end],
            keyframes: [startRef, endRef],
            keyframe_indexes: [0, 240],
        },
    ])(
        'sends 10-second image anchors at $keyframe_indexes',
        async ({ files, keyframes, keyframe_indexes }) => {
            const post = await send(10, files);
            expect(post).toHaveBeenCalledWith(
                'https://agents.lumalabs.ai/v1/generations',
                {
                    model: 'ray-3.2',
                    type: 'video',
                    prompt: 'Camera pans left',
                    aspect_ratio: '16:9',
                    video: {
                        duration: '10s',
                        resolution: '720p',
                        keyframes,
                        keyframe_indexes,
                    },
                },
                expect.anything(),
            );
        },
    );

    it('keeps the existing payload for five-second image generations', async () => {
        const post = await send(5);
        expect(post).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                video: {
                    duration: '5s',
                    resolution: '720p',
                    start_frame: startRef,
                    end_frame: endRef,
                },
            }),
            expect.anything(),
        );
    });
});
