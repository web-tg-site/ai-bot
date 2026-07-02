import { readFileSync } from 'fs';
const key = readFileSync('.env', 'utf8')
    .match(/HEYGEN_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const id = '21096125b4fb48699efb62a243aacea5';

for (let i = 0; i < 18; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const res = await fetch(`https://api.heygen.com/v3/videos/${id}`, {
        headers: { 'X-Api-Key': key },
    });
    const j = await res.json();
    console.log(
        i,
        j.data?.status,
        j.data?.video_url?.slice(0, 80) ?? j.data?.failure_message,
    );
    if (j.data?.video_url || j.data?.status === 'failed') break;
}
