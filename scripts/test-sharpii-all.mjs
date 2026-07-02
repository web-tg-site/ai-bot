import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const key = readFileSync('.env', 'utf8')
    .match(/SHARPII_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
};
const base = 'https://api.sharpii.ai';

async function submit(path, body, label) {
    const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = null;
    }
    const err = parsed?.error?.message ?? text.slice(0, 120);
    const taskId = parsed?.data?.task?.id;
    console.log(
        `[${label}] ${res.status} ${err}${taskId ? ` task=${taskId}` : ''}`,
    );
    return { status: res.status, taskId, err };
}

const tests = [
    [
        'MJ image',
        '/v1/images/generate',
        {
            model: 'mj-imagine',
            prompt: 'red apple studio photo',
            aspect_ratio: '1:1',
        },
    ],
    [
        'Sora video',
        '/v1/videos/generate',
        {
            model: 'sora-2',
            prompt: 'ocean waves',
            aspect_ratio: '16:9',
            duration: 10,
        },
    ],
    [
        'Seedance',
        '/v1/videos/generate',
        {
            model: 'seedance-2.0-720p',
            prompt: 'dancer in rain',
            aspect_ratio: '16:9',
            duration: 5,
        },
    ],
    [
        'Suno music',
        '/v1/audio/music',
        { model: 'suno-v5', prompt: 'short cinematic whoosh', duration: 5 },
    ],
    [
        'Voice clone',
        '/v1/audio/voice-clone',
        {
            model: 'minimax-voice-clone',
            text: 'test',
            audio_url: 'data:audio/ogg;base64,T2dnUwACAAAAAAAAAAA',
            custom_voice_id: `test-${randomUUID()}`,
        },
    ],
];

for (const [label, path, body] of tests) {
    await submit(path, body, label);
}
