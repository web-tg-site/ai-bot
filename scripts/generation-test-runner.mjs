/**
 * Standalone тест-раннер генерации изображений/видео.
 * Напрямую вызывает HTTP API провайдеров без NestJS/БД.
 *
 * Запуск:
 *   node scripts/generation-test-runner.mjs [--iterations 3] [--tools flux,luma_ray] [--timeout 180000]
 *
 * Нужны env-переменные (из .env):
 *   OPENAI_API_KEY, BFL_API_KEY, LUMA_API_KEY, OPENROUTER_API_KEY,
 *   SHARPII_API_KEY, HEYGEN_API_KEY, HIGGSFIELD_API_KEY, HIGGSFIELD_API_SECRET
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = resolve(__dirname, '../.env');
try {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (match) process.env[match[1]] = match[2].trim();
    }
} catch {}

const TEST_PROMPT = 'A cute cat sitting on a windowsill, soft natural lighting';
const POLL_INTERVAL = 3000;

const ERROR_CODE_LABELS = {
    1: 'UNKNOWN', 2: 'INSUFFICIENT_TOKENS', 10: 'CONFIG',
    11: 'TIMEOUT', 12: 'PROVIDER', 13: 'DELIVERY', 14: 'POLL', 15: 'CONTENT_POLICY',
};

function classifyError(msg) {
    if (!msg) return 1;
    const m = msg.split('\n\nID запроса:')[0].trim();
    if (m === 'INSUFFICIENT_TOKENS') return 2;
    if (/timed out|generation timed out/i.test(m)) return 11;
    if (/delivery failed/i.test(m)) return 13;
    if (/not configured|API_KEY/i.test(m)) return 10;
    if (/PROHIBITED_CONTENT|SEXUALLY_EXPLICIT|HATE_SPEECH|HARASSMENT|DANGEROUS_CONTENT|IMAGE_SAFETY|SAFETY|blocked|content policy|safety filter|moderation/i.test(m)) return 15;
    if (/HTTP \d+|provider|generation failed|Insufficient credits|Image generation failed/i.test(m)) return 12;
    return 1;
}

// --- Provider implementations ---

async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
}

// OpenAI GPT Images (sync)
async function testGptImages() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not configured');
    const res = await fetchJson('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1-mini', prompt: TEST_PROMPT, n: 1, size: '1024x1024' }),
    });
    if (!res.data?.[0]) throw new Error('No image in response');
    return { url: res.data[0].url ?? '(base64)' };
}

// BFL Flux (async)
async function testFlux(timeoutMs) {
    const key = process.env.BFL_API_KEY;
    if (!key) throw new Error('BFL_API_KEY not configured');
    const createRes = await fetchJson('https://api.bfl.ai/v1/flux-2-pro', {
        method: 'POST',
        headers: { 'x-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: TEST_PROMPT, width: 1024, height: 1024, output_format: 'jpeg', safety_tolerance: 2 }),
    });
    const pollingUrl = createRes.polling_url;
    if (!pollingUrl) throw new Error('No polling_url from BFL');
    return pollUntilDone(pollingUrl, { 'x-key': key }, timeoutMs, (data) => {
        if (data.status === 'Ready') return { done: true, url: data.result?.sample };
        if (data.status === 'Error' || data.status === 'Request Moderated') throw new Error(data.status);
        return { done: false };
    });
}

// OpenRouter (Nano Banana / Seedream — sync image gen)
async function testOpenRouterImage(model) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY not configured');
    const res = await fetchJson('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: TEST_PROMPT, aspect_ratio: '1:1' }),
    });
    if (!res.data?.[0]) throw new Error('No image in response: ' + JSON.stringify(res).slice(0, 200));
    return { url: res.data[0].url ?? '(base64)' };
}

// OpenRouter video (Kling, Veo — async)
async function testOpenRouterVideo(model, timeoutMs) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY not configured');
    const createRes = await fetchJson('https://openrouter.ai/api/v1/videos', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: TEST_PROMPT, aspect_ratio: '16:9', duration: 4 }),
    });
    const jobId = createRes.id;
    if (!jobId) throw new Error('No job id: ' + JSON.stringify(createRes).slice(0, 200));
    return pollUntilDone(
        `https://openrouter.ai/api/v1/videos/${jobId}`,
        { 'Authorization': `Bearer ${key}` },
        timeoutMs,
        (data) => {
            if (data.status === 'completed' || data.status === 'complete') return { done: true, url: data.unsigned_urls?.[0] ?? data.url };
            if (data.status === 'failed' || data.status === 'error') throw new Error(data.error ?? data.failure_reason ?? 'generation failed');
            return { done: false };
        },
    );
}

// Luma Ray (async)
async function testLumaRay(timeoutMs) {
    const key = process.env.LUMA_API_KEY;
    if (!key) throw new Error('LUMA_API_KEY not configured');
    const createRes = await fetchJson('https://agents.lumalabs.ai/v1/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'video', model: 'ray-3.2', prompt: TEST_PROMPT, aspect_ratio: '16:9', video: { resolution: '720p', duration: '5s' } }),
    });
    const jobId = createRes.id;
    if (!jobId) throw new Error('No job id from Luma: ' + JSON.stringify(createRes).slice(0, 200));
    return pollUntilDone(
        `https://agents.lumalabs.ai/v1/generations/${jobId}`,
        { 'Authorization': `Bearer ${key}` },
        timeoutMs,
        (data) => {
            if (data.state === 'completed') return { done: true, url: data.output?.[0]?.url };
            if (data.state === 'failed') throw new Error(data.failure_reason ?? 'Luma generation failed');
            return { done: false };
        },
    );
}

// Sharpii Midjourney (async)
async function testSharpiiImage(timeoutMs) {
    const key = process.env.SHARPII_API_KEY;
    const baseUrl = process.env.SHARPII_API_URL || 'https://api.sharpii.ai';
    if (!key) throw new Error('SHARPII_API_KEY not configured');
    const createRes = await fetchJson(`${baseUrl}/v1/images/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mj-imagine', prompt: TEST_PROMPT, aspect_ratio: '1:1' }),
    });
    const taskId = createRes.data?.task_id ?? createRes.data?.task?.id ?? createRes.task_id;
    if (!taskId) throw new Error('No task_id from Sharpii: ' + JSON.stringify(createRes).slice(0, 200));
    return pollUntilDone(
        `${baseUrl}/v1/tasks/${taskId}`,
        { 'Authorization': `Bearer ${key}` },
        timeoutMs,
        (data) => {
            const d = data.data ?? data;
            const st = d.status ?? d.task?.status;
            if (st === 'completed' || st === 'success') return { done: true, url: d.outputs?.[0]?.url ?? d.task?.outputs?.[0]?.url };
            if (st === 'failed' || st === 'error') throw new Error(d.error ?? d.task?.error ?? 'Sharpii generation failed');
            return { done: false };
        },
    );
}

// HeyGen (async — requires avatar + voice, skip if no defaults)
async function testHeyGen(timeoutMs) {
    const key = process.env.HEYGEN_API_KEY;
    if (!key) throw new Error('HEYGEN_API_KEY not configured');
    const avatarId = process.env.HEYGEN_AVATAR_ID || 'Wayne_20240711';
    const voiceId = process.env.HEYGEN_VOICE_ID || 'c19cb3f1e1424da2b9a0c6df0ee37c65';
    const createRes = await fetchJson('https://api.heygen.com/v3/videos', {
        method: 'POST',
        headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            dimension: { width: 1280, height: 720 },
            scenes: [{
                type: 'avatar',
                avatar_id: avatarId,
                script: { type: 'text', input: 'Hello, this is a test.', voice_id: voiceId },
            }],
        }),
    });
    const jobId = createRes.data?.video_id;
    if (!jobId) throw new Error('No video_id from HeyGen: ' + JSON.stringify(createRes).slice(0, 200));
    return pollUntilDone(
        `https://api.heygen.com/v3/videos/${jobId}`,
        { 'X-Api-Key': key },
        timeoutMs,
        (data) => {
            const d = data.data ?? data;
            if (d.status === 'completed') return { done: true, url: d.video_url };
            if (d.status === 'failed') throw new Error(d.failure_message ?? 'HeyGen generation failed');
            return { done: false };
        },
    );
}

// Higgsfield Platform DoP (async)
async function testHiggsfield(timeoutMs) {
    const apiKey = process.env.HIGGSFIELD_API_KEY;
    const apiSecret = process.env.HIGGSFIELD_API_SECRET;
    if (!apiKey || !apiSecret) throw new Error('HIGGSFIELD_API_KEY/SECRET not configured');
    const auth = { Authorization: `Key ${apiKey}:${apiSecret}`, 'Content-Type': 'application/json' };
    const createRes = await fetchJson('https://platform.higgsfield.ai/higgsfield-ai/dop/standard', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
            prompt: TEST_PROMPT,
            image_url: 'https://picsum.photos/800/600',
            enhance_prompt: true,
        }),
    });
    const jobId = createRes.request_id ?? createRes.id;
    if (!jobId) throw new Error('No request_id from Higgsfield: ' + JSON.stringify(createRes).slice(0, 200));
    return pollUntilDone(
        `https://platform.higgsfield.ai/requests/${jobId}/status`,
        auth,
        timeoutMs,
        (data) => {
            if (data.status === 'completed') return { done: true, url: data.video?.url };
            if (data.status === 'failed' || data.status === 'nsfw') throw new Error(data.error ?? 'Higgsfield generation failed');
            return { done: false };
        },
    );
}

// Topaz — requires an actual image, skip in test runner
async function testTopaz() {
    throw new Error('Topaz requires an input image — skipped in automated test');
}

// --- Polling helper ---
async function pollUntilDone(url, headers, timeoutMs, checkFn) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL);
        const data = await fetchJson(url, { method: 'GET', headers });
        const result = checkFn(data);
        if (result.done) return result;
    }
    throw new Error('generation timed out');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Tool registry ---
// Sora (OpenAI async video)
async function testSora(timeoutMs) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not configured');
    const createRes = await fetchJson('https://api.openai.com/v1/videos', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'sora-2', prompt: TEST_PROMPT, size: '1280x720', seconds: '8' }),
    });
    const jobId = createRes.id;
    if (!jobId) throw new Error('No id from Sora: ' + JSON.stringify(createRes).slice(0, 200));
    return pollUntilDone(
        `https://api.openai.com/v1/videos/${jobId}`,
        { 'Authorization': `Bearer ${key}` },
        timeoutMs,
        (data) => {
            if (data.status === 'completed' || data.status === 'succeeded') return { done: true, url: data.url ?? '(completed)' };
            if (data.status === 'failed') throw new Error(data.error?.message ?? 'Sora generation failed');
            return { done: false };
        },
    );
}

// BytePlus Seedance 2.5 (async video)
async function testBytePlusSeedance(timeoutMs) {
    const key = process.env.BYTEPLUS_API_KEY || process.env.ARK_API_KEY;
    const baseUrl = (process.env.BYTEPLUS_API_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');
    if (!key) throw new Error('BYTEPLUS_API_KEY (or ARK_API_KEY) not configured');
    const createRes = await fetchJson(`${baseUrl}/contents/generations/tasks`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'dreamina-seedance-2-5-260628',
            content: [{ type: 'text', text: TEST_PROMPT }],
            ratio: '16:9',
            resolution: '720p',
            duration: 5,
            generate_audio: true,
        }),
    });
    const taskId = createRes.id;
    if (!taskId) throw new Error('No id from BytePlus: ' + JSON.stringify(createRes).slice(0, 200));
    return pollUntilDone(
        `${baseUrl}/contents/generations/tasks/${taskId}`,
        { 'Authorization': `Bearer ${key}` },
        timeoutMs,
        (data) => {
            const st = (data.status ?? '').toLowerCase();
            if (['succeeded', 'success', 'completed', 'done'].includes(st)) {
                return { done: true, url: data.content?.video_url ?? '(completed)' };
            }
            if (['failed', 'error', 'cancelled', 'canceled'].includes(st)) {
                throw new Error(data.error?.message ?? data.error?.code ?? 'BytePlus Seedance failed');
            }
            return { done: false };
        },
    );
}

const TOOL_MAP = {
    gpt_images:  { name: 'GPT Images', fn: (t) => testGptImages() },
    flux:        { name: 'Flux', fn: (t) => testFlux(t) },
    nano_banana: { name: 'Nano Banana', fn: (t) => testOpenRouterImage('google/gemini-3.1-flash-image') },
    seedream:    { name: 'Seedream', fn: (t) => testOpenRouterImage('bytedance-seed/seedream-4.5') },
    midjourney:  { name: 'Midjourney', fn: (t) => testSharpiiImage(t) },
    kling:       { name: 'Kling', fn: (t) => testOpenRouterVideo('kwaivgi/kling-v3.0-std', t) },
    veo:         { name: 'Veo', fn: (t) => testOpenRouterVideo('google/veo-3.1-lite', t) },
    sora:        { name: 'Sora', fn: (t) => testSora(t) },
    seedance:    { name: 'Seedance 2.5', fn: (t) => testBytePlusSeedance(t) },
    luma_ray:    { name: 'Luma Ray', fn: (t) => testLumaRay(t) },
    higgsfield:  { name: 'Higgsfield', fn: (t) => testHiggsfield(t) },
    heygen:      { name: 'HeyGen', fn: (t) => testHeyGen(t) },
    topaz:       { name: 'Topaz', fn: () => testTopaz() },
};


// --- CLI ---
function parseArgs() {
    const args = process.argv.slice(2);
    let iterations = 5, tools, asyncTimeoutMs = 180000;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--iterations' && args[i + 1]) { iterations = parseInt(args[i + 1]); i++; }
        if (args[i] === '--tools' && args[i + 1]) { tools = args[i + 1].split(',').map(t => t.trim()); i++; }
        if (args[i] === '--timeout' && args[i + 1]) { asyncTimeoutMs = parseInt(args[i + 1]); i++; }
    }
    return { iterations, tools, asyncTimeoutMs };
}

function pad(s, n) { return String(s).padEnd(n); }
function padN(v, n) { return String(v).padStart(n); }

async function main() {
    const { iterations, tools: selectedTools, asyncTimeoutMs } = parseArgs();
    const toolIds = selectedTools ?? Object.keys(TOOL_MAP);

    console.log(`\n=== Generation Test Runner ===`);
    console.log(`Iterations per tool: ${iterations}`);
    console.log(`Tools: ${toolIds.join(', ')}`);
    console.log(`Async timeout: ${asyncTimeoutMs}ms\n`);

    const results = [];

    for (const toolId of toolIds) {
        const tool = TOOL_MAP[toolId];
        if (!tool) { console.log(`Unknown tool: ${toolId}, skipping`); continue; }

        console.log(`\n--- Testing ${toolId} (${tool.name}) ---`);

        for (let i = 1; i <= iterations; i++) {
            process.stdout.write(`  [${i}/${iterations}] `);
            const start = Date.now();
            try {
                const res = await tool.fn(asyncTimeoutMs);
                const latency = Date.now() - start;
                results.push({ toolId, iteration: i, success: true, latencyMs: latency });
                console.log(`OK (${latency}ms) ${res?.url ? res.url.slice(0, 80) : ''}`);
            } catch (error) {
                const latency = Date.now() - start;
                const msg = error.message ?? String(error);
                const code = classifyError(msg);
                const codeLabel = ERROR_CODE_LABELS[code] ?? 'UNKNOWN';
                results.push({ toolId, iteration: i, success: false, latencyMs: latency, errorMessage: msg.slice(0, 500), errorCode: codeLabel });
                console.log(`FAIL (${latency}ms) [${codeLabel}] ${msg.slice(0, 120)}`);
            }
        }
    }

    // --- Summary ---
    console.log('\n\n=== Summary ===');
    console.log(`${pad('Tool', 16)}| ${padN('Runs', 5)} | ${padN('OK', 5)} | ${padN('Fail', 5)} | ${pad('Fail%', 7)}| ${pad('Avg ms', 9)}| ${pad('Avg OK ms', 10)}`);
    console.log('-'.repeat(76));

    const summaries = {};
    for (const r of results) {
        if (!summaries[r.toolId]) summaries[r.toolId] = { runs: 0, ok: 0, fail: 0, totalMs: 0, okMs: 0 };
        const s = summaries[r.toolId];
        s.runs++; s.totalMs += r.latencyMs;
        if (r.success) { s.ok++; s.okMs += r.latencyMs; }
        else s.fail++;
    }

    for (const toolId of toolIds) {
        const s = summaries[toolId];
        if (!s) continue;
        const failPct = s.runs > 0 ? ((s.fail / s.runs) * 100).toFixed(1) + '%' : '-';
        const avgMs = s.runs > 0 ? Math.round(s.totalMs / s.runs) : 0;
        const avgOkMs = s.ok > 0 ? Math.round(s.okMs / s.ok) : '-';
        console.log(`${pad(toolId, 16)}| ${padN(s.runs, 5)} | ${padN(s.ok, 5)} | ${padN(s.fail, 5)} | ${pad(failPct, 7)}| ${pad(String(avgMs), 9)}| ${pad(String(avgOkMs), 10)}`);
    }

    // --- Error breakdown ---
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
        console.log('\n=== Error Breakdown ===');
        const byToolAndCode = {};
        for (const r of failed) {
            if (!byToolAndCode[r.toolId]) byToolAndCode[r.toolId] = {};
            byToolAndCode[r.toolId][r.errorCode] = (byToolAndCode[r.toolId][r.errorCode] ?? 0) + 1;
        }
        for (const [tool, codes] of Object.entries(byToolAndCode)) {
            console.log(`  ${tool}:`);
            for (const [code, count] of Object.entries(codes).sort((a, b) => b[1] - a[1])) {
                console.log(`    ${pad(code, 20)} ${count}x`);
            }
        }

        console.log('\n=== Raw Error Messages ===');
        for (const r of failed) {
            console.log(`  ${pad(r.toolId, 14)} [${r.errorCode}] ${r.errorMessage?.slice(0, 150)}`);
        }
    }

    // --- CONTENT_POLICY ---
    const cp = failed.filter(r => r.errorCode === 'CONTENT_POLICY');
    if (cp.length > 0) {
        console.log(`\n=== CONTENT_POLICY (ИИ отклонил генерацию): ${cp.length} ===`);
        for (const r of cp) console.log(`  ${pad(r.toolId, 14)} ${r.errorMessage?.slice(0, 150)}`);
    }

    // --- JSON ---
    const report = {
        generatedAt: new Date().toISOString(),
        iterations, asyncTimeoutMs, prompt: TEST_PROMPT,
        tools: toolIds, results, summaries,
    };
    const outPath = resolve(__dirname, 'generation-test-report.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nJSON-отчёт сохранён: ${outPath}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
