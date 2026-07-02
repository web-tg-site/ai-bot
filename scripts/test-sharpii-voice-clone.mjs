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

const sampleRes = await fetch(
    'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
);
const sampleBuf = Buffer.from(await sampleRes.arrayBuffer());
const dataUrl = `data:audio/ogg;base64,${sampleBuf.toString('base64')}`;
const voiceId = `bot-${randomUUID()}`;

const bodies = [
    {
        model: 'minimax-voice-clone',
        text: 'Привет, это тест клонирования.',
        audio_url: dataUrl,
    },
    {
        model: 'minimax-voice-clone',
        text: 'Привет, это тест клонирования.',
        audio_url: dataUrl,
        custom_voice_id: voiceId,
    },
    {
        model: 'minimax-voice-clone',
        text: 'Привет, это тест клонирования.',
        custom_voice_id: voiceId,
        need_noise_reduction: true,
        need_volume_normalization: true,
    },
    {
        model: 'minimax-voice-clone',
        text: 'Привет, это тест клонирования.',
        voice_url: dataUrl,
        custom_voice_id: voiceId,
    },
];

for (const body of bodies) {
    const res = await fetch(`${base}/v1/audio/voice-clone`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    console.log('\n', JSON.stringify(body).slice(0, 120), '->', res.status);
    console.log((await res.text()).slice(0, 350));
}
