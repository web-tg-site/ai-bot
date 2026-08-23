import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const key = env
    .match(/APIFRAME_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();

if (!key) {
    console.error('APIFRAME_API_KEY not found in .env');
    process.exit(1);
}

const base = 'https://api.apiframe.ai';

async function submit(body, label) {
    console.log('\n===', label, '===');
    const res = await fetch(`${base}/v2/music/generate`, {
        method: 'POST',
        headers: {
            'X-API-Key': key,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log(text.slice(0, 800));
    if (!res.ok) return null;
    return JSON.parse(text).jobId;
}

async function poll(jobId) {
    for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const res = await fetch(`${base}/v2/jobs/${jobId}`, {
            headers: { 'X-API-Key': key },
        });
        const data = await res.json();
        console.log(`poll ${i + 1}:`, data.status);
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            console.log(JSON.stringify(data, null, 2).slice(0, 1500));
            return data;
        }
    }
}

const jobId = await submit(
    {
        prompt: 'upbeat electronic track with synth arpeggios',
        model: 'suno',
        sunoParams: {
            model_version: 'V4_5PLUS',
            style: 'electronic, synthwave',
            instrumental: true,
        },
    },
    'suno generate instrumental',
);

if (jobId) await poll(jobId);
