import { readFileSync } from 'fs';

const key = readFileSync('.env', 'utf8')
    .match(/OPENAI_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();

if (!key) {
    console.error('OPENAI_API_KEY missing in .env');
    process.exit(1);
}

const base = 'https://api.openai.com/v1';

async function pollTask(id, label) {
    for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const res = await fetch(`${base}/videos/${id}`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        const task = await res.json();
        console.log(`[${label}] poll ${i + 1}:`, task.status, task.error?.message ?? '');
        if (task.status === 'completed' || task.status === 'failed') {
            return task;
        }
    }
    throw new Error(`Timeout waiting for ${label}`);
}

async function createVideo(body, label) {
    console.log(`\n=== ${label} ===`);
    const res = await fetch(`${base}/videos`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log(text.slice(0, 800));
    if (!res.ok) return null;
    const data = JSON.parse(text);
    return data.id;
}

const createId = await createVideo(
    {
        model: 'sora-2',
        prompt: 'A paper airplane gliding over a calm lake at sunrise',
        size: '1280x720',
        seconds: '4',
    },
    'create text-only',
);

if (createId) {
    const done = await pollTask(createId, 'create');
    console.log('Create result:', JSON.stringify(done, null, 2).slice(0, 1200));
}
