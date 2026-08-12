#!/usr/bin/env node
/**
 * Download Higgsfield motion preview clips for curated effects.
 *
 * Usage (from bot/):
 *   node scripts/download-effect-previews.mjs
 *   node scripts/download-effect-previews.mjs --force
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.resolve(
    BOT_ROOT,
    "../mini-app/public/previews/video-effects",
);

const PLATFORM_BASE_URL = "https://platform.higgsfield.ai";
const CLOUD_BASE_URL = "https://cloud.higgsfield.ai/api/v1";

const CURATED_MOTION_NAMES = [
    "Earth Zoom Out",
    "Zoom In",
    "Zoom Out",
    "Eyes In",
    "Turning Metal",
    "Melting",
    "Building Explosion",
    "Explosion",
    "Face Punch",
    "Diamond Duplicate",
    "Roll Transition",
    "Glitch",
    "Flame On",
    "Fire Element",
    "Water Bending",
    "Air Bending",
    "Levitation",
    "Hero Flight",
    "I Can Fly",
    "Money Rain",
    "Sakura Petals",
    "Smoke Transition",
    "Thunder God",
    "Cyborg",
    "Disintegration",
    "Black Tears",
    "Clone Explosion",
    "Color Rain",
    "Balloon",
    "Animalization",
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

function loadCredentials(env) {
    const credentials = env.HIGGSFIELD_CREDENTIALS?.trim() ?? "";
    let platformKey = "";
    let platformSecret = "";

    if (credentials.includes(":")) {
        [platformKey, platformSecret] = credentials.split(":", 2);
    } else {
        platformKey =
            env.HIGGSFIELD_KEY_ID?.trim() ||
            env.HIGGSFIELD_API_KEY?.trim() ||
            "";
        platformSecret = env.HIGGSFIELD_API_SECRET?.trim() || "";
    }

    const cloudKey = env.HIGGSFIELD_API_KEY?.trim() || "";
    return { platformKey, platformSecret, cloudKey };
}

function normalizeMotionList(raw) {
    const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && "motions" in raw
          ? raw.motions ?? []
          : [];

    return list
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item;
            const id = String(row.id ?? row.motion_id ?? "").trim();
            const name = String(row.name ?? row.title ?? "").trim();
            if (!id || !name) return null;
            const previewUrl =
                typeof row.preview_url === "string"
                    ? row.preview_url
                    : typeof row.previewUrl === "string"
                      ? row.previewUrl
                      : null;
            return { id, name, previewUrl };
        })
        .filter(Boolean);
}

async function fetchPlatformMotions(platformKey, platformSecret) {
    const response = await fetch(`${PLATFORM_BASE_URL}/v1/motions`, {
        headers: {
            Authorization: `Key ${platformKey}:${platformSecret}`,
            "Content-Type": "application/json",
            "hf-api-key": platformKey,
            "hf-secret": platformSecret,
        },
    });
    if (!response.ok) {
        throw new Error(`Platform motions ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return normalizeMotionList(await response.json());
}

async function fetchCloudMotions(cloudKey) {
    for (const route of ["/motions", "/generations/motions"]) {
        const response = await fetch(`${CLOUD_BASE_URL}${route}`, {
            headers: {
                Authorization: `Bearer ${cloudKey}`,
                "Content-Type": "application/json",
            },
        });
        if (!response.ok) continue;
        const motions = normalizeMotionList(await response.json());
        if (motions.length) return motions;
    }
    return [];
}

function filterCurated(motions) {
    const byName = new Map(
        motions.map((motion) => [motion.name.trim().toLowerCase(), motion]),
    );
    const curated = [];
    for (const name of CURATED_MOTION_NAMES) {
        const match = byName.get(name.toLowerCase());
        if (match) curated.push(match);
    }
    return curated;
}

async function downloadPreview(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function main() {
    const force = process.argv.includes("--force");
    const envPath = path.join(BOT_ROOT, ".env");
    const env = parseEnvFile(await readFile(envPath, "utf8").catch(() => ""));
    const { platformKey, platformSecret, cloudKey } = loadCredentials(env);

    let motions = [];
    if (platformKey && platformSecret) {
        console.log("Fetching motions from Higgsfield platform…");
        motions = await fetchPlatformMotions(platformKey, platformSecret);
    }
    if (!motions.length && cloudKey) {
        console.log("Fetching motions from Higgsfield cloud…");
        motions = await fetchCloudMotions(cloudKey);
    }
    if (!motions.length) {
        throw new Error(
            "No motions fetched. Configure HIGGSFIELD_CREDENTIALS or HIGGSFIELD_API_KEY in bot/.env",
        );
    }

    const curated = filterCurated(motions);
    console.log(`Found ${curated.length}/${CURATED_MOTION_NAMES.length} curated motions`);
    await mkdir(OUTPUT_DIR, { recursive: true });

    let downloaded = 0;
    let skipped = 0;
    let missing = 0;

    for (const motion of curated) {
        const outPath = path.join(OUTPUT_DIR, `${motion.id}.mp4`);
        if (!force) {
            try {
                await readFile(outPath);
                console.log(`[${motion.name}] skip (exists)`);
                skipped++;
                continue;
            } catch {
                /* download */
            }
        }

        if (!motion.previewUrl) {
            console.log(`[${motion.name}] no previewUrl — skipped`);
            missing++;
            continue;
        }

        try {
            console.log(`[${motion.name}] downloading…`);
            const buffer = await downloadPreview(motion.previewUrl);
            await writeFile(outPath, buffer);
            console.log(`  saved ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
            downloaded++;
        } catch (error) {
            console.error(`[${motion.name}] failed: ${error.message}`);
            missing++;
        }
    }

    console.log(
        `\nDone. downloaded=${downloaded}, skipped=${skipped}, missing=${missing}`,
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
