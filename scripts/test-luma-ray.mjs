import { readFileSync } from 'fs';

function readEnvKey(name) {
    return readFileSync('.env', 'utf8')
        .match(new RegExp(`${name}=(.+)`))?.[1]
        ?.replace(/"/g, '')
        .trim();
}

const key = readEnvKey('LUMA_API_KEY');
if (!key) {
    console.error('LUMA_API_KEY missing in .env');
    process.exit(1);
}

const submit = await fetch('https://agents.lumalabs.ai/v1/generations', {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        model: 'ray-3.2',
        type: 'video',
        prompt: 'A slow dolly shot through a misty greenhouse at sunrise',
        aspect_ratio: '16:9',
        video: {
            resolution: '720p',
            duration: '5s',
        },
    }),
});

const submitText = await submit.text();
console.log('submit', submit.status, submitText.slice(0, 400));

if (!submit.ok) process.exit(1);

const { id } = JSON.parse(submitText);
if (!id) {
    console.error('No generation id');
    process.exit(1);
}

await new Promise((r) => setTimeout(r, 30_000));

for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`https://agents.lumalabs.ai/v1/generations/${id}`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    const body = await poll.json();
    console.log('poll', i, body.state);
    if (body.state === 'completed') {
        console.log('output', body.output?.[0]?.url?.slice(0, 120));
        break;
    }
    if (body.state === 'failed') {
        console.error('failed', body.failure_reason, body.failure_code);
        process.exit(1);
    }
}
