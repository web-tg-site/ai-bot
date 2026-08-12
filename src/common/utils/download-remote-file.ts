import type { Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type StreamRemoteFileOptions = {
    disposition?: 'inline' | 'attachment';
    filename?: string;
    extraHeaders?: Record<string, string>;
};

function getRemoteUrlsToTry(url: string): string[] {
    const urlsToTry = [url];
    if (
        url.includes('openrouter.ai/api/v1/videos/') &&
        !url.endsWith('/content')
    ) {
        urlsToTry.push(url.replace(/\/?$/, '/content'));
    }
    return urlsToTry;
}

/** Stream a remote file with HTTP Range passthrough (required for iOS video playback). */
export async function streamRemoteFile(
    url: string,
    req: { headers: { range?: string } },
    res: Response,
    options?: StreamRemoteFileOptions,
): Promise<void> {
    const rawRange = req.headers.range;
    const rangeHeader = Array.isArray(rawRange)
        ? rawRange[0]
        : typeof rawRange === 'string'
          ? rawRange
          : undefined;
    const urlsToTry = getRemoteUrlsToTry(url);
    let lastError: Error | undefined;

    for (const targetUrl of urlsToTry) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        try {
            const fetchHeaders: Record<string, string> = {
                ...(getAuthHeadersForUrl(targetUrl) ?? {}),
                ...(options?.extraHeaders ?? {}),
            };
            if (rangeHeader) {
                fetchHeaders['Range'] = rangeHeader;
            }

            const response = await fetch(targetUrl, {
                headers: fetchHeaders,
                signal: controller.signal,
            });

            if (!response.ok && response.status !== 206) {
                lastError = new Error(
                    `Failed to stream file: HTTP ${response.status}`,
                );
                continue;
            }

            const mimeType =
                response.headers.get('content-type')?.split(';')[0].trim() ??
                'application/octet-stream';

            res.setHeader('Content-Type', mimeType);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.setHeader('Accept-Ranges', 'bytes');

            const disposition = options?.disposition ?? 'inline';
            if (options?.filename) {
                res.setHeader(
                    'Content-Disposition',
                    `${disposition}; filename="${options.filename}"`,
                );
            }

            for (const header of ['content-length', 'content-range'] as const) {
                const value = response.headers.get(header);
                if (value) {
                    res.setHeader(header, value);
                }
            }

            res.status(response.status);

            if (!response.body) {
                res.end();
                return;
            }

            const nodeStream = Readable.fromWeb(
                response.body as import('stream/web').ReadableStream,
            );
            await pipeline(nodeStream, res);
            return;
        } catch (error) {
            lastError =
                error instanceof Error ? error : new Error(String(error));
            if (res.headersSent) {
                throw lastError;
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError ?? new Error('Failed to stream file');
}

export async function downloadRemoteFile(
    url: string,
    headers?: Record<string, string>,
): Promise<{ buffer: Buffer; mimeType: string }> {
    const authHeaders = headers ?? getAuthHeadersForUrl(url);
    const urlsToTry = getRemoteUrlsToTry(url);

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
