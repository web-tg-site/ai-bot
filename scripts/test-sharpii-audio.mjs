import { readFileSync } from 'fs';

const key = readFileSync('.env', 'utf8')
    .match(/SHARPII_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
};
const base = 'https://api.sharpii.ai';

async function poll(taskId) {
    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch(`${base}/v1/tasks/${taskId}`, { headers });
        const data = await res.json();
        const status = data.data?.status;
        console.log('poll', i, status);
        if (status === 'completed' || status === 'failed') {
            console.log(JSON.stringify(data, null, 2).slice(0, 800));
            return;
        }
    }
}

const bodies = [
    {
        model: 'minimax-speech-hd',
        text: 'Привет, это тест озвучки.',
        voice: 'Wise_Woman',
        speech_speed: 1.0,
        emotion: 'neutral',
    },
    {
        model: 'minimax-speech-turbo',
        text: 'Привет, это тест озвучки.',
        voice: 'Friendly_Person',
    },
    {
        model: 'vocolab',
        text: 'Hello test',
        voice: 'narrator_warm.wav',
    },
];

for (const body of bodies) {
    const res = await fetch(`${base}/v1/audio/speech`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log('\n===', body.model, res.status, '===');
    console.log(text.slice(0, 400));
    try {
        const data = JSON.parse(text);
        const taskId = data.data?.task?.id;
        if (taskId) await poll(taskId);
    } catch {}
}
