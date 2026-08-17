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

const LUMA_BASE_URL = 'https://agents.lumalabs.ai/v1';

type LumaGenerationResponse = {
    id: string;
    type?: string;
    state: string;
    model?: string;
    output?: Array<{ type?: string; url?: string }>;
    failure_reason?: string | null;
    failure_code?: string | null;
};

const LUMA_IMAGE_TOOLS = new Set<AiToolId>([
    AiToolId.LUMA_IMAGE,
    AiToolId.LUMA_IMAGE_MAX,
]);

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

        const body = this.buildRequestBody(toolId, input);
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
            const outputs = response.output.filter((o) => o.url);
            const primary = outputs[0];
            const additionalUrls = outputs.slice(1).map((o) => o.url!);

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
                const resultType = this.inferResultType(
                    toolIdFromResponse(response),
                    primary.url,
                    mimeType,
                );

                return {
                    status,
                    result: {
                        type: resultType,
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
                        type: this.inferResultType(
                            toolIdFromResponse(response),
                            primary.url,
                        ),
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

    private buildRequestBody(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Record<string, unknown> {
        switch (toolId) {
            case AiToolId.LUMA_RAY:
                return this.buildVideoBody(input);
            case AiToolId.LUMA_IMAGE:
                return this.buildImageBody(input, 'uni-1');
            case AiToolId.LUMA_IMAGE_MAX:
                return this.buildImageBody(input, 'uni-1-max');
            case AiToolId.LUMA_IMAGE_EDIT:
                return this.buildImageEditBody(input);
            case AiToolId.LUMA_LAYERING:
                return this.buildLayeringBody(input);
            case AiToolId.LUMA_VIDEO_EDIT:
                return this.buildVideoEditBody(input);
            case AiToolId.LUMA_VIDEO_REFRAME:
                return this.buildVideoReframeBody(input);
            default:
                throw new Error(`Unsupported Luma tool: ${toolId}`);
        }
    }

    private buildImageBody(
        input: AiGenerationInput,
        model: string,
    ): Record<string, unknown> {
        const prompt = input.prompt?.trim();
        if (!prompt) {
            throw new Error('Опишите изображение для генерации');
        }

        const body: Record<string, unknown> = {
            type: 'image',
            model,
            prompt,
        };

        if (input.aspectRatio) {
            body.aspect_ratio = input.aspectRatio;
        }

        if (input.lumaStyle) {
            body.style = input.lumaStyle;
        }

        if (input.lumaOutputFormat) {
            body.output_format = input.lumaOutputFormat;
        }

        if (input.lumaWebSearch) {
            body.web_search = true;
        }

        const refs = input.files?.filter((f) =>
            f.mimeType.startsWith('image/'),
        );
        if (refs?.length) {
            body.image_ref = refs.slice(0, 9).map((file) => toImageRef(file));
        }

        return body;
    }

    private buildImageEditBody(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const prompt = input.prompt?.trim();
        if (!prompt) {
            throw new Error('Опишите, что нужно изменить в изображении');
        }

        const source = this.resolveSource(input);
        const body: Record<string, unknown> = {
            type: 'image_edit',
            model: 'uni-1',
            prompt,
            source,
        };

        if (input.lumaStyle) {
            body.style = input.lumaStyle;
        }

        const refs = input.files?.filter(
            (f, i) =>
                f.mimeType.startsWith('image/') &&
                input.attachmentRoles?.[i] !== 'source',
        );
        if (refs?.length) {
            body.image_ref = refs.slice(0, 9).map((file) => toImageRef(file));
        }

        return body;
    }

    private buildLayeringBody(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const source = this.resolveSource(input);
        const body: Record<string, unknown> = {
            type: 'layering',
            model: 'uni-1',
            prompt: input.prompt?.trim()?.slice(0, 500) ?? '',
            source,
        };

        if (input.resolution === '2K') {
            body.layering = { resolution: '2k' };
        } else {
            body.layering = { resolution: '1k' };
        }

        return body;
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

        const images = input.files?.filter((f) =>
            f.mimeType.startsWith('image/'),
        );
        if (images?.[0]) {
            video.start_frame = toImageRef(images[0]);
        }
        if (images?.[1]) {
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

        const source = this.resolveVideoSource(input);

        return {
            model: 'ray-3.2',
            type: 'video_edit',
            prompt,
            source,
        };
    }

    private buildVideoReframeBody(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const source = this.resolveVideoSource(input);

        return {
            model: 'ray-3.2',
            type: 'video_reframe',
            aspect_ratio: input.aspectRatio ?? '16:9',
            source,
        };
    }

    private resolveSource(input: AiGenerationInput): Record<string, unknown> {
        if (input.sourceGenerationId) {
            return { generation_id: input.sourceGenerationId };
        }

        const images = input.files?.filter((f) =>
            f.mimeType.startsWith('image/'),
        );
        const sourceFile =
            images?.find((_, i) => input.attachmentRoles?.[i] === 'source') ??
            images?.[0];

        if (!sourceFile) {
            throw new Error('Загрузите исходное изображение');
        }

        return toImageRef(sourceFile);
    }

    private resolveVideoSource(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        if (input.sourceGenerationId) {
            return { generation_id: input.sourceGenerationId };
        }

        const video = input.files?.find((f) => f.mimeType.startsWith('video/'));
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
        typeHint: string | undefined,
        url: string,
        mimeType?: string,
    ): 'image' | 'video' {
        if (typeHint === 'video' || mimeType?.startsWith('video/')) {
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

function toolIdFromResponse(response: LumaGenerationResponse): string {
    return response.type ?? 'image';
}

export function isLumaImageTool(toolId: AiToolId): boolean {
    return LUMA_IMAGE_TOOLS.has(toolId);
}
