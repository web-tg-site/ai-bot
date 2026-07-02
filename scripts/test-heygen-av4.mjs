import { readFileSync } from 'fs';

const key = readFileSync('.env', 'utf8')
    .match(/HEYGEN_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();

const imgRes = await fetch(
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
);
const imgBuf = Buffer.from(await imgRes.arrayBuffer());

const upload = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'image/jpeg' },
    body: imgBuf,
});
const uploadJson = await upload.json();
console.log('upload', upload.status, uploadJson.data?.image_key);

const gen = await fetch('https://api.heygen.com/v2/video/av4/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
        image_key: uploadJson.data.image_key,
        video_title: 'Talking photo test',
        script: 'Hello, this is a test talking photo.',
        voice_id: '37832e32d4f7475ab7a1cb0db8e5dd66',
        video_orientation: 'portrait',
    }),
});
const genJson = await gen.json();
console.log('generate', gen.status, JSON.stringify(genJson).slice(0, 600));

if (genJson.data?.video_id) {
    await new Promise((r) => setTimeout(r, 15000));
    const status = await fetch(
        `https://api.heygen.com/v1/video_status.get?video_id=${genJson.data.video_id}`,
        {
            headers: { 'X-Api-Key': key },
        },
    );
    console.log('status', (await status.text()).slice(0, 400));
}
