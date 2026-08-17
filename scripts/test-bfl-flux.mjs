import { readFileSync } from 'fs';

function readEnvKey(name) {
    return readFileSync('.env', 'utf8')
        .match(new RegExp(`${name}=(.+)`))?.[1]
        ?.replace(/"/g, '')
        .trim();
}

const key = readEnvKey('BFL_API_KEY');
if (!key) {
    console.error('BFL_API_KEY missing in .env');
    process.exit(1);
}

const submit = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
    method: 'POST',
    headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'x-key': key,
    },
    body: JSON.stringify({
        prompt: 'A serene mountain lake at sunrise, photorealistic',
        width: 1024,
        height: 576,
    }),
});

const submitText = await submit.text();
console.log('submit', submit.status, submitText.slice(0, 400));

if (!submit.ok) process.exit(1);

const { polling_url: pollingUrl } = JSON.parse(submitText);
if (!pollingUrl) {
    console.error('No polling_url');
    process.exit(1);
}

for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(pollingUrl, {
        headers: { accept: 'application/json', 'x-key': key },
    });
    const body = await poll.json();
    console.log('poll', i, body.status);
    if (body.status === 'Ready') {
        console.log('sample', body.result?.sample?.slice(0, 120));
        break;
    }
    if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(body.status)) {
        console.error('failed', body);
        process.exit(1);
    }
}
