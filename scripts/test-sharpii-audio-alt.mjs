import { readFileSync } from 'fs';
const key = readFileSync('.env', 'utf8')
    .match(/SHARPII_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
};

const tests = [
    [
        'speech minimax',
        '/v1/audio/speech',
        {
            model: 'minimax-speech-hd',
            text: 'test',
            voice: 'alloy',
            format: 'mp3',
        },
    ],
    [
        'speech vibevoice',
        '/v1/audio/speech',
        { model: 'vibevoice', text: 'test', voice: 'alloy', format: 'mp3' },
    ],
    [
        'speech elevenlabs',
        '/v1/audio/speech',
        {
            model: 'elevenlabs-tts',
            text: 'test',
            voice: 'alloy',
            format: 'mp3',
        },
    ],
    [
        'sfx?',
        '/v1/audio/sfx',
        {
            model: 'elevenlabs-sound-effects',
            prompt: 'door creak',
            duration: 3,
        },
    ],
    [
        'generate audio',
        '/v1/audio/generate',
        { model: 'elevenlabs-sound-effects', prompt: 'whoosh', duration: 5 },
    ],
];

for (const [label, path, body] of tests) {
    const res = await fetch(`https://api.sharpii.ai${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    console.log(label, res.status, (await res.text()).slice(0, 200));
}
