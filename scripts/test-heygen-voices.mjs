import { readFileSync } from 'fs';
const key = readFileSync('.env', 'utf8')
    .match(/HEYGEN_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const res = await fetch('https://api.heygen.com/v2/voices', {
    headers: { 'X-Api-Key': key },
});
const json = await res.json();
const ru = json.data?.voices?.filter((v) =>
    /russian|рус/i.test(v.language ?? ''),
);
console.log(
    'ru voices',
    ru
        ?.slice(0, 5)
        .map((v) => ({ id: v.voice_id, name: v.name, lang: v.language })),
);
