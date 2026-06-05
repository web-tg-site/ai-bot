import { access, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataDir = resolve(__dirname, '../dist');

async function removeDataFromBuild(): Promise<void> {
    console.log('Start removing build');
    try {
        await access(dataDir);
    } catch {
        console.log(`Directory not found, skipping: ${dataDir}`);
        return;
    }

    await rm(dataDir, { recursive: true, force: true });
    console.log(`Removed build`);
}

removeDataFromBuild().catch((error: unknown) => {
    console.error('Failed to remove data directory from build:', error);
    process.exit(1);
});
