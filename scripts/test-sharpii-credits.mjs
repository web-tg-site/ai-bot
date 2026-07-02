import { readFileSync } from 'fs';

const key = readFileSync('.env', 'utf8')
    .match(/SHARPII_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
console.log('Key prefix:', key?.slice(0, 12) + '...');

for (const path of [
    '/v1/account',
    '/v1/user',
    '/v1/credits',
    '/v1/billing/credits',
]) {
    const res = await fetch(`https://api.sharpii.ai${path}`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    console.log(path, res.status, (await res.text()).slice(0, 300));
}
