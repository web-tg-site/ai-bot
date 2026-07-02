import { readFileSync } from 'fs';

const key = readFileSync('.env', 'utf8')
    .match(/SHARPII_API_KEY=(.+)/)[1]
    .replace(/"/g, '')
    .trim();

async function submit(body, label) {
    console.log('\n===', label, '===');
    const res = await fetch('https://api.sharpii.ai/v1/images/generate', {
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
    return data.data?.task?.id;
}

async function poll(taskId) {
    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const res = await fetch(`https://api.sharpii.ai/v1/tasks/${taskId}`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        const data = await res.json();
        const task = data.data;
        console.log(`poll ${i + 1}:`, task?.status, task?.error?.message ?? '');
        if (task?.status === 'completed' || task?.status === 'failed') {
            console.log(JSON.stringify(task, null, 2).slice(0, 1200));
            return;
        }
    }
}

const taskId = await submit(
    {
        model: 'mj-imagine',
        prompt: 'editorial portrait of a red apple, soft light --ar 1:1',
        aspect_ratio: '1:1',
    },
    'mj-imagine standard',
);

if (taskId) await poll(taskId);

await submit(
    {
        model: 'mj-imagine',
        prompt: 'red apple --draft',
        aspect_ratio: '1:1',
    },
    'mj-imagine draft',
);
