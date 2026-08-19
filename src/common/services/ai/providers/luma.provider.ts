import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    AiFileInput,
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
} from '../types';
import { AiToolId } from '../types';
import { downloadRemoteFile } from '@/common/utils/download-remote-file';
import { splitMediaFiles } from '@/common/utils/normalize-upload-mime';

const LUMA_BASE_URL = 'https://agents.lumalabs.ai/v1';

type LumaRayOperation = 'video' | 'video_edit' | 'video_reframe';

type LumaGenerationResponse = {
    id: string;
    type?: string;
    state: string;
    model?: string;
    output?: Array<{ type?: string; url?: string }>;
    failure_reason?: string | null;
    failure_code?: string | null;
};

@Injectable()
export class LumaProvider {
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(LumaProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey =
            configService.get<string>('LUMA_API_KEY') ??
            configService.get<string>('LUMA_AGENTS_API_KEY') ??
            '';
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (toolId !== AiToolId.LUMA_RAY) {
            throw new Error(`Luma supports only Luma Ray tool, got ${toolId}`);
        }

        const body = this.buildLumaRayBody(input);
        const response = await this.post<LumaGenerationResponse>(
            '/generations',
            body,
        );

        if (!response.id) {
            throw new Error('Luma did not return generation id');
        }

        return {
            providerJobId: response.id,
            estimatedTokenCost: 0,
        };
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        this.ensureApiKey();

        const response = await this.get<LumaGenerationResponse>(
            `/generations/${providerJobId}`,
        );
        const status = this.mapState(response.state);

        if (status === 'completed' && response.output?.length) {
            const outputs = response.output.filter((item) => item.url);
            const primary = outputs[0];
            const additionalUrls = outputs.slice(1).map((item) => item.url!);

            if (!primary?.url) {
                return {
                    status: 'failed',
                    errorMessage: 'Luma завершил задачу без URL результата',
                };
            }

            try {
                const { buffer, mimeType } = await downloadRemoteFile(
                    primary.url,
                );
                return {
                    status,
                    result: {
                        type: this.inferResultType(primary.url, mimeType),
                        buffer,
                        mimeType,
                        url: primary.url,
                        additionalUrls:
                            additionalUrls.length > 0
                                ? additionalUrls
                                : undefined,
                    },
                };
            } catch (error) {
                this.logger.warn(
                    { err: error instanceof Error ? error.message : error },
                    'Luma result download failed, returning URL',
                );
                return {
                    status,
                    result: {
                        type: this.inferResultType(primary.url),
                        url: primary.url,
                        additionalUrls:
                            additionalUrls.length > 0
                                ? additionalUrls
                                : undefined,
                    },
                };
            }
        }

        if (status === 'failed') {
            return {
                status,
                errorMessage:
                    response.failure_reason ??
                    response.failure_code ??
                    'Luma generation failed',
            };
        }

        return { status };
    }

    private resolveLumaRayOperation(
        input: AiGenerationInput,
    ): LumaRayOperation {
        const { videos } = splitMediaFiles(input.files);
        const video = videos[0];
        if (!video) {
            return 'video';
        }

        if (input.prompt?.trim()) {
            return 'video_edit';
        }

        return 'video_reframe';
    }

    private buildLumaRayBody(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const operation = this.resolveLumaRayOperation(input);

        switch (operation) {
            case 'video_edit':
                return this.buildVideoEditBody(input);
            case 'video_reframe':
                return this.buildVideoReframeBody(input);
            default:
                return this.buildVideoBody(input);
        }
    }

    private buildVideoBody(input: AiGenerationInput): Record<string, unknown> {
        const prompt = input.prompt?.trim();
        if (!prompt) {
            throw new Error('Опишите сцену для видео');
        }

        const durationSec = input.durationSeconds ?? 5;
        const duration = durationSec <= 5 ? '5s' : '10s';

        const video: Record<string, unknown> = {
            resolution: input.resolution === '1080p' ? '1080p' : '720p',
            duration,
        };

        const { images } = splitMediaFiles(input.files);
        if (images[0]) {
            video.start_frame = toImageRef(images[0]);
        }
        if (images[1]) {
            video.end_frame = toImageRef(images[1]);
        }

        return {
            model: 'ray-3.2',
            type: 'video',
            prompt,
            aspect_ratio: input.aspectRatio ?? '16:9',
            video,
        };
    }

    private buildVideoEditBody(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const prompt = input.prompt?.trim();
        if (!prompt) {
            throw new Error('Опишите, как изменить видео');
        }

        return {
            model: 'ray-3.2',
            type: 'video_edit',
            prompt,
            source: this.resolveVideoSource(input),
        };
    }

    private buildVideoReframeBody(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        return {
            model: 'ray-3.2',
            type: 'video_reframe',
            aspect_ratio: input.aspectRatio ?? '16:9',
            source: this.resolveVideoSource(input),
        };
    }

    private resolveVideoSource(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        if (input.sourceGenerationId) {
            return { generation_id: input.sourceGenerationId };
        }

        const { videos } = splitMediaFiles(input.files);
        const video = videos[0];
        if (video) {
            return {
                data: video.buffer.toString('base64'),
                media_type: video.mimeType,
            };
        }

        throw new Error('Загрузите исходное видео');
    }

    private mapState(state: string): AiJobStatusResult['status'] {
        const normalized = state.toLowerCase();
        if (normalized === 'completed') return 'completed';
        if (normalized === 'failed') return 'failed';
        if (normalized === 'queued') return 'pending';
        return 'processing';
    }

    private inferResultType(
        url: string,
        mimeType?: string,
    ): 'image' | 'video' {
        if (mimeType?.startsWith('video/')) {
            return 'video';
        }
        if (
            url.includes('.mp4') ||
            url.includes('.webm') ||
            url.includes('.mov')
        ) {
            return 'video';
        }
        return 'image';
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('LUMA_API_KEY is not configured');
        }
    }

    private getHeaders(): Record<string, string> {
        return {
            accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
        };
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        const response = await firstValueFrom(
            this.httpService.post<T>(`${LUMA_BASE_URL}${path}`, data, {
                headers: this.getHeaders(),
                timeout: 120000,
            }),
        );
        return response.data;
    }

    private async get<T>(path: string): Promise<T> {
        const response = await firstValueFrom(
            this.httpService.get<T>(`${LUMA_BASE_URL}${path}`, {
                headers: this.getHeaders(),
                timeout: 60000,
            }),
        );
        return response.data;
    }
}

function toImageRef(file: AiFileInput): Record<string, unknown> {
    return {
        data: file.buffer.toString('base64'),
        media_type: file.mimeType,
    };
}
