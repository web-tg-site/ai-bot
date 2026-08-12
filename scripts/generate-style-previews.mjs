#!/usr/bin/env node
/**
 * Generate neutral style preview clips.
 * Prefers OpenRouter Veo (4s); falls back to Higgsfield cloud (5s) when no OpenRouter key.
 *
 * Usage (from bot/):
 *   node scripts/generate-style-previews.mjs
 *   node scripts/generate-style-previews.mjs --only=cinematic,anime
 *   node scripts/generate-style-previews.mjs --force
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.resolve(
    BOT_ROOT,
    "../mini-app/public/previews/video-styles",
);

const VEO_MODEL = "google/veo-3.1-lite";
const HIGGSFIELD_CLOUD_URL = "https://cloud.higgsfield.ai/api/v1";
const BASE_PROMPT =
    "A simple white ceramic mug on a neutral gray surface, soft diffused lighting, minimal static composition.";

const STYLE_PRESETS = [
    {
        id: "cinematic",
        promptSuffix:
            "cinematic style, dramatic lighting, smooth camera movement, film grain, shallow depth of field",
    },
    {
        id: "cyberpunk",
        promptSuffix:
            "cyberpunk style, neon lights, rain-slicked streets, purple and blue glow, futuristic city, Blade Runner aesthetic",
    },
    {
        id: "anime",
        promptSuffix:
            "anime style, cel-shaded, vibrant colors, clean lines, stylized animation",
    },
    {
        id: "realistic",
        promptSuffix:
            "photorealistic style, natural lighting, high detail, DSLR quality, lifelike textures",
    },
    {
        id: "3d",
        promptSuffix:
            "3D animation style, rendered look, soft lighting, Pixar-like polish",
    },
    {
        id: "vintage",
        promptSuffix:
            "vintage film style, warm tones, light leaks, soft focus, 8mm film grain, nostalgic mood",
    },
    {
        id: "noir",
        promptSuffix:
            "film noir style, high contrast black and white, dramatic shadows, moody atmosphere",
    },
    {
        id: "watercolor",
        promptSuffix:
            "watercolor painting style, soft edges, pastel colors, hand-painted texture",
    },
    {
        id: "vaporwave",
        promptSuffix:
            "vaporwave aesthetic, pink and cyan palette, retro 80s, surreal dreamy atmosphere",
    },
    {
        id: "documentary",
        promptSuffix:
            "documentary style, handheld camera, natural light, authentic raw footage feel",
    },
    {
        id: "horror",
        promptSuffix:
            "horror style, dark atmosphere, eerie lighting, unsettling mood, suspenseful tension",
    },
    {
        id: "fantasy",
        promptSuffix:
            "fantasy style, magical atmosphere, ethereal glow, epic otherworldly scenery",
    },
    {
        id: "minimal",
        promptSuffix:
            "minimalist style, clean composition, muted palette, simple elegant aesthetics",
    },
    {
        id: "retro_80s",
        promptSuffix:
            "1980s retro style, VHS aesthetic, synthwave colors, nostalgic arcade vibe",
    },
    {
        id: "pixel",
        promptSuffix:
            "pixel art style, retro 16-bit, limited color palette, nostalgic game aesthetic",
    },
];

function parseEnvFile(content) {
    const env = {};
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
    return env;
}

function parseArgs(argv) {
    const onlyArg = argv.find((arg) => arg.startsWith("--only="));
    const only = onlyArg
        ? onlyArg
              .slice("--only=".length)
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
        : null;
    const force = argv.includes("--force");
    return { only, force };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(fn, { attempts = 4, delayMs = 5000, label = "" } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                console.log(
                    `  ${label}attempt ${attempt}/${attempts} failed: ${error.message}. Retrying in ${delayMs / 1000}s…`,
                );
                await sleep(delayMs);
            }
        }
    }
    throw lastError;
}

async function loadEnv() {
    const envPath = path.join(BOT_ROOT, ".env");
    const content = await readFile(envPath, "utf8").catch(() => "");
    return parseEnvFile(content);
}

async function loadProvider(env) {
    const openRouterKey = env.OPENROUTER_API_KEY?.trim();
    if (openRouterKey) {
        return { kind: "openrouter", apiKey: openRouterKey };
    }
    const higgsfieldKey = env.HIGGSFIELD_API_KEY?.trim();
    if (higgsfieldKey) {
        return { kind: "higgsfield", apiKey: higgsfieldKey };
    }
    throw new Error(
        "Neither OPENROUTER_API_KEY nor HIGGSFIELD_API_KEY found in bot/.env",
    );
}

async function openRouterPost(apiKey, route, body) {
    const response = await fetch(`https://openrouter.ai/api/v1${route}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`POST ${route} ${response.status}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text);
}

async function openRouterGet(apiKey, route) {
    const response = await fetch(`https://openrouter.ai/api/v1${route}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`GET ${route} ${response.status}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text);
}

function mapStatus(status) {
    const normalized = String(status ?? "").toLowerCase();
    if (["completed", "success", "done"].includes(normalized)) return "completed";
    if (["failed", "error"].includes(normalized)) return "failed";
    if (["processing", "running", "in_progress", "in-progress"].includes(normalized)) {
        return "processing";
    }
    return "pending";
}

async function pollOpenRouterVideo(apiKey, jobId) {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
        const status = await openRouterGet(apiKey, `/videos/${jobId}`);
        const mapped = mapStatus(status.status);
        process.stdout.write(`  status: ${status.status ?? mapped}\n`);
        if (mapped === "completed") {
            return (
                status.unsigned_urls?.[0] ??
                `https://openrouter.ai/api/v1/videos/${jobId}/content`
            );
        }
        if (mapped === "failed") {
            throw new Error(
                `Video job failed: ${JSON.stringify(status.error ?? status).slice(0, 300)}`,
            );
        }
        await sleep(5000);
    }
    throw new Error(`Timed out polling video job ${jobId}`);
}

async function downloadVideo(url, apiKey) {
    const headers =
        apiKey && url.includes("openrouter.ai")
            ? { Authorization: `Bearer ${apiKey}` }
            : {};
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`Download failed ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function generateStylePreviewOpenRouter(apiKey, preset) {
    const prompt = `${BASE_PROMPT} ${preset.promptSuffix}`.trim();
    console.log(`\n[${preset.id}] Creating OpenRouter job…`);

    const created = await openRouterPost(apiKey, "/videos", {
        model: VEO_MODEL,
        prompt,
        aspect_ratio: "16:9",
        resolution: "720p",
        duration: 4,
    });

    if (!created.id) {
        throw new Error(`No job id returned: ${JSON.stringify(created).slice(0, 200)}`);
    }

    const videoUrl = await pollOpenRouterVideo(apiKey, created.id);
    console.log(`  downloading…`);
    const buffer = await downloadVideo(videoUrl, apiKey);
    const outPath = path.join(OUTPUT_DIR, `${preset.id}.mp4`);
    await writeFile(outPath, buffer);
    console.log(`  saved ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function higgsfieldPost(apiKey, route, body) {
    const response = await fetch(`${HIGGSFIELD_CLOUD_URL}${route}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`POST ${route} ${response.status}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text);
}

async function higgsfieldGet(apiKey, route) {
    const response = await fetch(`${HIGGSFIELD_CLOUD_URL}${route}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`GET ${route} ${response.status}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text);
}

async function pollHiggsfieldVideo(apiKey, jobId) {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
        const status = await higgsfieldGet(apiKey, `/generations/${jobId}`);
        const mapped = mapStatus(status.status);
        process.stdout.write(`  status: ${status.status ?? mapped}\n`);
        if (mapped === "completed" && status.output_url) {
            return status.output_url;
        }
        if (mapped === "failed") {
            throw new Error(
                `Video job failed: ${JSON.stringify(status.error ?? status).slice(0, 300)}`,
            );
        }
        await sleep(5000);
    }
    throw new Error(`Timed out polling Higgsfield job ${jobId}`);
}

async function generateStylePreviewHiggsfield(apiKey, preset) {
    const prompt = `${BASE_PROMPT} ${preset.promptSuffix}`.trim();
    console.log(`\n[${preset.id}] Creating Higgsfield job…`);

    const created = await higgsfieldPost(apiKey, "/generations/video", {
        prompt,
        duration: 5,
        resolution: "720p",
    });

    if (!created.id) {
        throw new Error(`No job id returned: ${JSON.stringify(created).slice(0, 200)}`);
    }

    const videoUrl = await pollHiggsfieldVideo(apiKey, created.id);
    console.log(`  downloading…`);
    const buffer = await downloadVideo(videoUrl);
    const outPath = path.join(OUTPUT_DIR, `${preset.id}.mp4`);
    await writeFile(outPath, buffer);
    console.log(`  saved ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function generateStylePreview(provider, preset) {
    if (provider.kind === "openrouter") {
        await generateStylePreviewOpenRouter(provider.apiKey, preset);
        return;
    }
    await generateStylePreviewHiggsfield(provider.apiKey, preset);
}

async function main() {
    const { only, force } = parseArgs(process.argv.slice(2));
    const env = await loadEnv();
    const provider = await loadProvider(env);
    await mkdir(OUTPUT_DIR, { recursive: true });

    let presets = STYLE_PRESETS;
    if (only?.length) {
        presets = presets.filter((preset) => only.includes(preset.id));
        if (!presets.length) {
            throw new Error(`No presets matched --only=${only.join(",")}`);
        }
    }

    console.log(
        `Generating ${presets.length} style previews via ${provider.kind} → ${OUTPUT_DIR}`,
    );

    for (const preset of presets) {
        const outPath = path.join(OUTPUT_DIR, `${preset.id}.mp4`);
        if (!force) {
            try {
                await readFile(outPath);
                console.log(`\n[${preset.id}] Skipping (exists, use --force to regenerate)`);
                continue;
            } catch {
                /* generate */
            }
        }

        try {
            await withRetries(() => generateStylePreview(provider, preset), {
                label: `[${preset.id}] `,
            });
            await sleep(3000);
        } catch (error) {
            console.error(`\n[${preset.id}] Failed after retries: ${error.message}`);
        }
    }

    const generated = [];
    for (const preset of presets) {
        try {
            await readFile(path.join(OUTPUT_DIR, `${preset.id}.mp4`));
            generated.push(preset.id);
        } catch {
            /* missing */
        }
    }
    console.log(`\nDone. ${generated.length}/${presets.length} previews ready.`);
    if (generated.length < presets.length) {
        const missing = presets
            .map((p) => p.id)
            .filter((id) => !generated.includes(id));
        console.log(`Missing: ${missing.join(", ")}`);
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
