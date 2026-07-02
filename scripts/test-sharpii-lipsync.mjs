import { readFileSync } from 'fs';

const key = readFileSync('.env', 'utf8')
    .match(/SHARPII_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
};

const pcm = Buffer.alloc(240000);
const wavHdr = Buffer.alloc(44);
wavHdr.write('RIFF', 0);
wavHdr.writeUInt32LE(36 + pcm.length, 4);
wavHdr.write('WAVE', 8);
wavHdr.write('fmt ', 12);
wavHdr.writeUInt32LE(16, 16);
wavHdr.writeUInt16LE(1, 20);
wavHdr.writeUInt16LE(1, 22);
wavHdr.writeUInt32LE(24000, 24);
wavHdr.writeUInt32LE(48000, 28);
wavHdr.writeUInt16LE(2, 32);
wavHdr.writeUInt16LE(16, 34);
wavHdr.write('data', 36);
wavHdr.writeUInt32LE(pcm.length, 40);
const wav = Buffer.concat([wavHdr, pcm]);

// litterbox 1h retention
const form = new FormData();
form.append('reqtype', 'fileupload');
form.append('time', '1h');
form.append(
    'fileToUpload',
    new Blob([wav], { type: 'audio/wav' }),
    'speech.wav',
);
const up = await fetch(
    'https://litterbox.catbox.moe/resources/internals/api.php',
    { method: 'POST', body: form },
);
const audioUrl = (await up.text()).trim();
console.log('audioUrl', audioUrl);

const imageUrl =
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400';

const res = await fetch('https://api.sharpii.ai/v1/videos/lipsync', {
    method: 'POST',
    headers,
    body: JSON.stringify({
        model: 'avatar-lite',
        image_url: imageUrl,
        audio_url: audioUrl,
    }),
});
console.log('lipsync catbox', res.status, (await res.text()).slice(0, 500));

const gen = await fetch('https://api.sharpii.ai/v1/videos/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
        model: 'avatar-lite',
        prompt: 'talking',
        first_frame_url: imageUrl,
        audio_url: audioUrl,
    }),
});
console.log('generate', gen.status, (await gen.text()).slice(0, 500));
