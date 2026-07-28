import { readFileSync } from 'fs';

const key = readFileSync('.env', 'utf8')
    .match(/SHARPII_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();

const res = await fetch('https://api.sharpii.ai/v1/videos/generate', {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        model: 'luma-ray3',
        prompt: 'a huge banana falling on a planet',
        duration: 5,
        aspect_ratio: '16:9',
    }),
});

console.log(res.status, (await res.text()).slice(0, 500));
