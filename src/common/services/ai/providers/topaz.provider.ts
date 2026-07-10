import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosResponse } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import imageSize from 'image-size';
import {
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
    AiFileInput,
} from '../types';
import { calculateTopazTokenCost } from '@/common/config/image-editor-capabilities.config';
import { getToolById } from '@/common/config/ai-tools.registry';
import { AiToolId } from '../types';

const IMAGE_BASE = 'https://api.topazlabs.com/image/v1';
const VIDEO_BASE = 'https://api.topazlabs.com';

@Injectable()
export class TopazProvider {
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(TopazProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('TOPAZ_API_KEY') ?? '';
    }

    async createJob(input: AiGenerationInput): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        const file = input.files?.[0];
        if (!file) {
            throw new Error('Отправьте видео или фото для улучшения качества');
        }

        if (file.mimeType.startsWith('image/')) {
            return this.createImageJob(file, input.topazScale ?? 2);
        }

        if (file.mimeType.startsWith('video/')) {
            return this.createVideoJob(file, input.topazScale ?? 2);
        }

        throw new Error('Поддерживаются только фото и видео');
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        if (providerJobId.startsWith('image:')) {
            return this.getImageJobStatus(providerJobId.slice('image:'.length));
        }

        if (providerJobId.startsWith('video:')) {
            return this.getVideoJobStatus(providerJobId.slice('video:'.length));
        }

        throw new Error('Unknown Topaz job id format');
    }

    private async createImageJob(
        file: AiFileInput,
        topazScale: number,
    ): Promise<AiJobCreateResult> {
        const dimensions = imageSize(file.buffer);
        const width = dimensions.width;
        const height = dimensions.height;

        const form = new FormData();
        form.append('model', 'Standard V2');
        form.append('output_format', 'jpeg');
        if (width && height) {
            form.append('output_width', String(width * topazScale));
            form.append('output_height', String(height * topazScale));
        }
        form.append(
            'image',
            new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
            this.resolveImageFileName(file),
        );

        let response: AxiosResponse<{ process_id?: string }>;
        try {
            response = await firstValueFrom(
                this.httpService.post<{ process_id?: string }>(
                    `${IMAGE_BASE}/enhance/async`,
                    form,
                    {
                        headers: this.getHeaders(),
                        timeout: 120000,
                    },
                ),
            );
        } catch (error) {
            const message = this.formatError(error);
            this.logger.error(`Topaz image enhance failed: ${message}`);
            throw new Error(message);
        }

        const processId =
            response.data.process_id ??
            (response.headers['x-process-id'] as string | undefined);

        if (!processId) {
            throw new Error('Topaz Image API did not return process_id');
        }

        return {
            providerJobId: `image:${processId}`,
            estimatedTokenCost: this.resolveTopazTokenCost(topazScale),
        };
    }

    private async createVideoJob(
        file: AiFileInput,
        topazScale: number,
    ): Promise<AiJobCreateResult> {
        const container = this.resolveVideoContainer(file);
        const { width, height } = this.guessVideoResolution(file.buffer.length);
        const frameRate = 24;
        const duration = Math.max(
            1,
            Math.min(30, Math.round(file.buffer.length / 200_000)),
        );
        const frameCount = Math.round(duration * frameRate);

        const createResponse = await this.post<{ requestId: string }>(
            '/video/',
            {
                source: {
                    resolution: { width, height },
                    container,
                    size: file.buffer.length,
                    duration,
                    frameRate,
                    frameCount,
                },
                output: {
                    resolution: {
                        width: width * topazScale,
                        height: height * topazScale,
                    },
                    audioCodec: 'AAC',
                    audioTransfer: 'Copy',
                    frameRate,
                    dynamicCompressionLevel: 'High',
                    container,
                },
                filters: [{ model: 'prob-4' }],
            },
        );

        const requestId = createResponse.requestId;

        const acceptResponse = await this.patch<{ urls: string[] }>(
            `/video/${requestId}/accept`,
        );

        const uploadUrl = acceptResponse.urls[0];
        if (!uploadUrl) {
            throw new Error('Topaz did not return upload URL');
        }

        const uploadResult = await firstValueFrom(
            this.httpService.put(uploadUrl, file.buffer, {
                headers: { 'Content-Type': file.mimeType || 'video/mp4' },
                timeout: 300000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            }),
        );

        const rawEtag = uploadResult.headers['etag'] as unknown;
        const eTag =
            typeof rawEtag === 'string' ? rawEtag.replace(/"/g, '') : undefined;
        if (!eTag) {
            throw new Error('Topaz upload did not return ETag');
        }

        await this.patch(`/video/${requestId}/complete-upload`, {
            uploadResults: [{ partNum: 1, eTag }],
        });

        return {
            providerJobId: `video:${requestId}`,
            estimatedTokenCost: this.resolveTopazTokenCost(topazScale),
        };
    }

    private resolveTopazTokenCost(topazScale: number): number {
        const tool = getToolById(AiToolId.TOPAZ);
        return calculateTopazTokenCost(tool?.baseTokenCost ?? 40, topazScale);
    }

    private async getImageJobStatus(
        processId: string,
    ): Promise<AiJobStatusResult> {
        const statusResponse = await this.get<{
            status: string;
            message?: string;
        }>(`${IMAGE_BASE}/status/${processId}`);

        const status = this.mapImageStatus(statusResponse.status);

        if (status === 'failed') {
            return {
                status,
                errorMessage:
                    statusResponse.message ?? 'Topaz image enhancement failed',
            };
        }

        if (status !== 'completed') {
            return { status };
        }

        const downloadMeta = await this.get<{
            download_url?: string;
        }>(`${IMAGE_BASE}/download/${processId}`);

        if (!downloadMeta.download_url) {
            return {
                status: 'failed',
                errorMessage: 'Topaz did not return image download URL',
            };
        }

        return {
            status: 'completed',
            result: {
                type: 'image',
                url: downloadMeta.download_url,
                mimeType: 'image/jpeg',
            },
        };
    }

    private async getVideoJobStatus(
        requestId: string,
    ): Promise<AiJobStatusResult> {
        const response = await this.get<{
            status: string;
            download?: { url?: string };
            message?: string;
        }>(`/video/${requestId}/status`);

        const status = this.mapVideoStatus(response.status);

        if (status === 'completed' && response.download?.url) {
            return {
                status,
                result: { type: 'video', url: response.download.url },
            };
        }

        if (status === 'failed') {
            return {
                status,
                errorMessage:
                    response.message ?? 'Topaz video enhancement failed',
            };
        }

        return { status };
    }

    private resolveImageFileName(file: AiFileInput): string {
        if (file.fileName) {
            return file.fileName;
        }

        if (file.mimeType.includes('png')) {
            return 'image.png';
        }

        if (file.mimeType.includes('webp')) {
            return 'image.webp';
        }

        return 'image.jpg';
    }

    private resolveVideoContainer(file: AiFileInput): 'mp4' | 'mov' | 'mkv' {
        if (
            file.mimeType.includes('quicktime') ||
            file.fileName?.endsWith('.mov')
        ) {
            return 'mov';
        }
        if (file.fileName?.endsWith('.mkv')) {
            return 'mkv';
        }
        return 'mp4';
    }

    private guessVideoResolution(fileSize: number): {
        width: number;
        height: number;
    } {
        if (fileSize < 2_000_000) {
            return { width: 640, height: 360 };
        }
        if (fileSize < 10_000_000) {
            return { width: 1280, height: 720 };
        }
        return { width: 1920, height: 1080 };
    }

    private mapImageStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (normalized === 'completed') return 'completed';
        if (normalized === 'failed' || normalized === 'cancelled')
            return 'failed';
        if (normalized === 'processing' || normalized === 'pending')
            return 'processing';
        return 'pending';
    }

    private mapVideoStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (normalized === 'complete' || normalized === 'completed')
            return 'completed';
        if (
            normalized === 'failed' ||
            normalized === 'canceled' ||
            normalized === 'cancelled'
        ) {
            return 'failed';
        }
        if (
            [
                'processing',
                'preprocessing',
                'postprocessing',
                'initializing',
                'accepted',
            ].includes(normalized)
        ) {
            return 'processing';
        }
        return 'pending';
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('TOPAZ_API_KEY is not configured');
        }
    }

    private getHeaders(): Record<string, string> {
        return { 'X-API-Key': this.apiKey };
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${VIDEO_BASE}${path}`, data, {
                    headers: {
                        ...this.getHeaders(),
                        'Content-Type': 'application/json',
                    },
                    timeout: 120000,
                }),
            );
            return response.data;
        } catch (error) {
            const message = this.formatError(error);
            this.logger.error(`Topaz POST ${path} failed: ${message}`);
            throw new Error(message);
        }
    }

    private async patch<T>(path: string, data?: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.patch<T>(`${VIDEO_BASE}${path}`, data ?? {}, {
                    headers: {
                        ...this.getHeaders(),
                        'Content-Type': 'application/json',
                    },
                    timeout: 120000,
                }),
            );
            return response.data;
        } catch (error) {
            const message = this.formatError(error);
            this.logger.error(`Topaz PATCH ${path} failed: ${message}`);
            throw new Error(message);
        }
    }

    private async get<T>(path: string): Promise<T> {
        try {
            const url = path.startsWith('http') ? path : `${VIDEO_BASE}${path}`;
            const response = await firstValueFrom(
                this.httpService.get<T>(url, {
                    headers: this.getHeaders(),
                    timeout: 60000,
                }),
            );
            return response.data;
        } catch (error) {
            const message = this.formatError(error);
            this.logger.error(`Topaz GET ${path} failed: ${message}`);
            throw new Error(message);
        }
    }

    private formatError(error: unknown): string {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as {
                response?: {
                    status?: number;
                    data?: { message?: string; error?: { message?: string } };
                };
            };

            const message =
                axiosError.response?.data?.message ??
                axiosError.response?.data?.error?.message;

            if (message) return message;

            if (axiosError.response?.status) {
                return `Topaz API error: HTTP ${axiosError.response.status}`;
            }
        }

        return error instanceof Error ? error.message : 'Topaz API error';
    }
}
