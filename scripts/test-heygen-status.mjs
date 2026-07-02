import { readFileSync } from 'fs';
const key = readFileSync('.env', 'utf8')
    .match(/HEYGEN_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const videoId = '21096125b4fb48699efb62a243aacea5';

const v3 = await fetch(`https://api.heygen.com/v3/videos/${videoId}`, {
    headers: { 'X-Api-Key': key },
});
console.log('v3', v3.status, (await v3.text()).slice(0, 400));

const v1 = await fetch(
    `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
    { headers: { 'X-Api-Key': key } },
);
console.log('v1', v1.status, (await v1.text()).slice(0, 400));
