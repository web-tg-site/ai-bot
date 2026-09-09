import { Injectable } from '@nestjs/common';
import { AiToolId } from './types';
import { getToolById } from '@/common/config/ai-tools.registry';
import {
    downloadRemoteFile,
    getAuthHeadersForUrl,
} from '@/common/utils/download-remote-file';
import { parseDataUrl } from '@/common/utils/parse-data-url';
import {
    ELEVENLABS_DUBBING_RESULT_PREFIX,
    ElevenLabsProvider,
    isElevenLabsDubbingResultUrl,
} from './providers/elevenlabs.provider';
import { HiggsfieldProvider } from './providers/higgsfield.provider';
import { BytePlusProvider } from './providers/byteplus.provider';
import { TopazProvider } from './providers/topaz.provider';
import { TempPublicMediaService } from './temp-public-media.service';
import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';

export type ResolvedJobMedia = {
    buffer: Buffer;
    mimeType: string;
};

@Injectable()
export class JobMediaResolverService {
    private static readonly MEDIA_CACHE_MAX = 80;
    private static readonly MEDIA_CACHE_MAX_BYTES = 200 * 1024 * 1024;
    private readonly mediaCache = new Map<
        string,
        { buffer: Buffer; mimeType: string; accessedAt: number }
    >();
    private mediaCacheBytes = 0;

    constructor(
        private readonly bytePlusProvider: BytePlusProvider,
        private readonly elevenLabsProvider: ElevenLabsProvider,
        private readonly higgsfieldProvider: HiggsfieldProvider,
        private readonly tempPublicMedia: TempPublicMediaService,
        private readonly topazProvider: TopazProvider,
    ) {}

    async resolveCompletedJobMedia(job: {
        id: string;
        resultUrl: string;
        providerJobId: string | null;
        toolId: AiToolId;
    }): Promise<ResolvedJobMedia> {
        const cached = this.getCachedMedia(job.id);
        if (cached) {
            return cached;
        }

        const jobLocal = this.tempPublicMedia.getByJobId(job.id);
        const raw = jobLocal
            ? {
                  buffer: jobLocal.buffer,
                  mimeType: jobLocal.mimeType,
              }
            : await this.resolveJobMedia(
                  job.resultUrl,
                  job.providerJobId,
                  job.toolId,
              );

        const media = await this.prepareWebPlayback(job.toolId, raw);
        this.setCachedMedia(job.id, media.buffer, media.mimeType);
        this.tempPublicMedia.put({
            buffer: media.buffer,
            mimeType: media.mimeType,
            fileName: `generation-${job.id.slice(0, 8)}`,
            jobId: job.id,
        });

        return media;
    }

    async resolveJobMedia(
        resultUrl: string,
        providerJobId: string | null,
        toolId: AiToolId,
    ): Promise<ResolvedJobMedia> {
        const buffered = await this.resolveBufferedJobMedia(
            resultUrl,
            providerJobId,
            toolId,
        );
        if (buffered) {
            return buffered;
        }

        try {
            return await downloadRemoteFile(
                resultUrl,
                getAuthHeadersForUrl(resultUrl),
            );
        } catch (remoteError) {
            if (toolId === AiToolId.TOPAZ && providerJobId) {
                const refreshed =
                    await this.topazProvider.fetchResultMedia(providerJobId);
                if (refreshed) {
                    return refreshed;
                }
            }
            if (toolId === AiToolId.SEEDANCE && providerJobId) {
                const status =
                    await this.bytePlusProvider.getJobStatus(providerJobId);
                if (status.result?.buffer) {
                    return {
                        buffer: status.result.buffer,
                        mimeType: status.result.mimeType ?? 'video/mp4',
                    };
                }
            }
            throw remoteError;
        }
    }

    /** Returns buffer for data URLs and ElevenLabs dubbing; null for streamable remote URLs. */
    async resolveBufferedJobMedia(
        resultUrl: string,
        providerJobId: string | null,
        toolId?: AiToolId,
    ): Promise<ResolvedJobMedia | null> {
        const dataUrl = parseDataUrl(resultUrl);
        if (dataUrl) {
            return { buffer: dataUrl.buffer, mimeType: dataUrl.mimeType };
        }

        if (
            toolId === AiToolId.SEEDANCE &&
            providerJobId &&
            /bytepluses?\.com|byteplus|tos-cn|tos-ap|ark\./i.test(resultUrl)
        ) {
            const status =
                await this.bytePlusProvider.getJobStatus(providerJobId);
            if (status.result?.buffer) {
                return {
                    buffer: status.result.buffer,
                    mimeType: status.result.mimeType ?? 'video/mp4',
                };
            }
        }

        if (isElevenLabsDubbingResultUrl(resultUrl) && providerJobId) {
            const parsed = this.parseElevenLabsDubbingUrl(resultUrl);
            const downloaded =
                await this.elevenLabsProvider.downloadDubbingResult(
                    providerJobId,
                    {
                        type: parsed.mimeType.startsWith('video/')
                            ? 'video'
                            : 'audio',
                        url: resultUrl,
                        mimeType: parsed.mimeType,
                    },
                );
            if (!downloaded.buffer || !downloaded.mimeType) {
                throw new Error('Empty dubbing result');
            }
            return {
                buffer: downloaded.buffer,
                mimeType: downloaded.mimeType,
            };
        }

        if (toolId === AiToolId.HIGGSFIELD && providerJobId) {
            return this.higgsfieldProvider.fetchResultMedia(providerJobId);
        }

        if (toolId === AiToolId.TOPAZ && providerJobId) {
            return this.topazProvider.fetchResultMedia(providerJobId);
        }

        return null;
    }

    resolveMediaType(
        toolId: AiToolId,
        mimeType: string,
    ): 'image' | 'video' | 'audio' {
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (this.isVideoTool(toolId)) return 'video';
        if (this.isVoiceTool(toolId)) return 'audio';
        return 'image';
    }

    buildMediaFilename(jobId: string, mimeType: string): string {
        const base = `generation-${jobId.slice(0, 8)}`;
        const ext = mimeType.startsWith('video/')
            ? 'mp4'
            : mimeType.startsWith('audio/')
              ? 'mp3'
              : mimeType.includes('png')
                ? 'png'
                : 'jpg';
        return `${base}.${ext}`;
    }

    /**
     * Telegram WebView cannot play HEVC/non-faststart MP4 (Topaz, some Seedance).
     * Skip when already H.264-compatible — ffmpeg probe returns early.
     */
    private async prepareWebPlayback(
        toolId: AiToolId,
        media: ResolvedJobMedia,
    ): Promise<ResolvedJobMedia> {
        if (media.mimeType.startsWith('image/') || media.mimeType.startsWith('audio/')) {
            return media;
        }
        if (
            !media.mimeType.startsWith('video/') &&
            !this.isVideoTool(toolId)
        ) {
            return media;
        }
        try {
            const buffer = await transcodeVideoToH264(media.buffer, {
                timeoutMs: 180_000,
                fitSideRange: { minSide: 64, maxSide: 4096 },
            });
            return { buffer, mimeType: 'video/mp4' };
        } catch {
            return media;
        }
    }

    private parseElevenLabsDubbingUrl(url: string): { mimeType: string } {
        const raw = url.slice(ELEVENLABS_DUBBING_RESULT_PREFIX.length);
        const parts = raw.split('/');
        const encodedMime = parts[2] ?? 'audio/mpeg';
        try {
            return { mimeType: decodeURIComponent(encodedMime) };
        } catch {
            return { mimeType: 'audio/mpeg' };
        }
    }

    private getCachedMedia(jobId: string): ResolvedJobMedia | null {
        const entry = this.mediaCache.get(jobId);
        if (!entry) return null;
        entry.accessedAt = Date.now();
        return { buffer: entry.buffer, mimeType: entry.mimeType };
    }

    private setCachedMedia(
        jobId: string,
        buffer: Buffer,
        mimeType: string,
    ): void {
        const existing = this.mediaCache.get(jobId);
        if (existing) {
            this.mediaCacheBytes -= existing.buffer.length;
        }
        this.mediaCacheBytes += buffer.length;
        this.mediaCache.set(jobId, {
            buffer,
            mimeType,
            accessedAt: Date.now(),
        });
        this.evictMediaCache();
    }

    private evictMediaCache(): void {
        while (
            (this.mediaCache.size > JobMediaResolverService.MEDIA_CACHE_MAX ||
                this.mediaCacheBytes >
                    JobMediaResolverService.MEDIA_CACHE_MAX_BYTES) &&
            this.mediaCache.size > 0
        ) {
            let oldest: string | null = null;
            let oldestTime = Infinity;
            for (const [key, val] of this.mediaCache) {
                if (val.accessedAt < oldestTime) {
                    oldestTime = val.accessedAt;
                    oldest = key;
                }
            }
            if (!oldest) break;
            const entry = this.mediaCache.get(oldest)!;
            this.mediaCacheBytes -= entry.buffer.length;
            this.mediaCache.delete(oldest);
        }
    }

    private isVideoTool(toolId: AiToolId) {
        const tool = getToolById(toolId);
        return tool?.category === 'video';
    }

    private isVoiceTool(toolId: AiToolId) {
        const tool = getToolById(toolId);
        return tool?.category === 'audio' || toolId === AiToolId.VIDEO_TO_AUDIO;
    }
}
