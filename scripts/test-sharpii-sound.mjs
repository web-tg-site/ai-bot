import { readFileSync } from 'fs';
const key = readFileSync('.env', 'utf8')
    .match(/SHARPII_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
};

for (const model of [
    'suno-v5',
    'suno-v4.5plus',
    'suno-v4.5all',
    'suno-music',
    'suno-lyrics',
]) {
    const res = await fetch('https://api.sharpii.ai/v1/audio/music', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            prompt: 'short cinematic whoosh',
            duration: 5,
        }),
    });
    const text = await res.text();
    console.log(model, res.status, text.slice(0, 220));
}
