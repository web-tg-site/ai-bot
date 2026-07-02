import { readFileSync, writeFileSync } from 'fs';

function loadEnv() {
    const env = readFileSync('.env', 'utf8');
    const get = (key) =>
        env
            .match(new RegExp(`${key}=(.+)`))?.[1]
            ?.replace(/^"|"$/g, '')
            .trim();
    return {
        apiKey: get('ELEVENLABS_API_KEY'),
        voiceId: get('ELEVENLABS_VOICE_ID') ?? '21m00Tcm4TlvDq8ikWAM',
        modelId: get('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2',
    };
}

const { apiKey, voiceId, modelId } = loadEnv();

if (!apiKey) {
    console.error('ELEVENLABS_API_KEY not set in .env');
    process.exit(1);
}

const baseUrl = 'https://api.elevenlabs.io/v1';
const headers = { 'xi-api-key': apiKey };

async function testTts() {
    const text = 'Привет! Это тест ElevenLabs TTS.';
    const res = await fetch(`${baseUrl}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: modelId }),
    });

    if (!res.ok) {
        const body = await res.text();
        if (res.status === 403 && body.includes('Just a moment')) {
            throw new Error(
                'Geo-blocked: ElevenLabs API returns Cloudflare 403 from this region. Deploy to Railway or use VPN.',
            );
        }
        throw new Error(`TTS failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync('scripts/test-elevenlabs-tts.mp3', buffer);
    console.log(
        `[tts] ok, ${buffer.length} bytes -> scripts/test-elevenlabs-tts.mp3`,
    );
}

async function testSoundEffect() {
    const res = await fetch(`${baseUrl}/sound-generation`, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
            text: 'short whoosh',
            duration_seconds: 2,
        }),
    });

    if (!res.ok) {
        throw new Error(
            `Sound generation failed: ${res.status} ${await res.text()}`,
        );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync('scripts/test-elevenlabs-sfx.mp3', buffer);
    console.log(
        `[sound] ok, ${buffer.length} bytes -> scripts/test-elevenlabs-sfx.mp3`,
    );
}

async function testDubbing() {
    const pcmPath = 'scripts/test-audio.pcm';
    let fileBuffer;
    let fileName = 'sample.mp3';
    let mimeType = 'audio/mpeg';

    try {
        fileBuffer = readFileSync(pcmPath);
        fileName = 'test-audio.pcm';
        mimeType = 'audio/pcm';
    } catch {
        console.log('[dubbing] skipped: no scripts/test-audio.pcm');
        return;
    }

    const form = new FormData();
    form.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);
    form.append('target_lang', 'ru');
    form.append('source_lang', 'auto');
    form.append('mode', 'automatic');

    const createRes = await fetch(`${baseUrl}/dubbing`, {
        method: 'POST',
        headers,
        body: form,
    });

    if (!createRes.ok) {
        throw new Error(
            `Dubbing create failed: ${createRes.status} ${await createRes.text()}`,
        );
    }

    const { dubbing_id: dubbingId } = await createRes.json();
    console.log(`[dubbing] created job ${dubbingId}`);

    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(`${baseUrl}/dubbing/${dubbingId}`, {
            headers,
        });
        const statusData = await statusRes.json();
        console.log(`[dubbing] status=${statusData.status}`);

        if (statusData.status === 'dubbed') {
            const lang = statusData.target_languages?.[0] ?? 'ru';
            const audioRes = await fetch(
                `${baseUrl}/dubbing/${dubbingId}/audio/${lang}`,
                { headers },
            );
            if (!audioRes.ok) {
                throw new Error(
                    `Dubbing download failed: ${audioRes.status} ${await audioRes.text()}`,
                );
            }
            const buffer = Buffer.from(await audioRes.arrayBuffer());
            writeFileSync('scripts/test-elevenlabs-dub.mp3', buffer);
            console.log(
                `[dubbing] ok, ${buffer.length} bytes -> scripts/test-elevenlabs-dub.mp3`,
            );
            return;
        }

        if (statusData.status === 'failed') {
            throw new Error(statusData.error ?? 'Dubbing failed');
        }
    }

    throw new Error('Dubbing timed out');
}

console.log('ElevenLabs smoke tests\n');

await testTts();
await testSoundEffect();
await testDubbing();

console.log('\nAll tests passed');
