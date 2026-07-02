export async function downloadRemoteFile(
    url: string,
    headers?: Record<string, string>,
): Promise<{ buffer: Buffer; mimeType: string }> {
    const authHeaders = headers ?? getAuthHeadersForUrl(url);
    const urlsToTry = [url];

    if (
        url.includes('openrouter.ai/api/v1/videos/') &&
        !url.endsWith('/content')
    ) {
        urlsToTry.push(url.replace(/\/?$/, '/content'));
    }

    let lastError: Error | undefined;

    for (const targetUrl of urlsToTry) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        try {
            const response = await fetch(targetUrl, {
                headers: authHeaders ?? getAuthHeadersForUrl(targetUrl),
                signal: controller.signal,
            });

            if (!response.ok) {
                lastError = new Error(
                    `Failed to download file: HTTP ${response.status}`,
                );
                continue;
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const mimeType =
                response.headers.get('content-type')?.split(';')[0].trim() ??
                'application/octet-stream';

            return { buffer, mimeType };
        } catch (error) {
            lastError =
                error instanceof Error ? error : new Error(String(error));
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError ?? new Error('Failed to download file');
}

export function getAuthHeadersForUrl(
    url: string,
): Record<string, string> | undefined {
    if (url.includes('openrouter.ai')) {
        const key = process.env.OPENROUTER_API_KEY;
        if (key) {
            return { Authorization: `Bearer ${key}` };
        }
    }

    return undefined;
}
