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

const BFL_BASE_URL = 'https://api.bfl.ai';
export const BFL_JOB_PREFIX = 'bfl|';

type FluxOperation = 'pro' | 'outpaint' | 'erase' | 'deblur' | 'vto';

const FLUX_ENDPOINTS: Record<FluxOperation, string> = {
    pro: '/v1/flux-2-pro',
    outpaint: '/v1/flux-tools/outpainting-v1',
    erase: '/v1/flux-tools/erase-v1',
    deblur: '/v1/flux-tools/deblur-v1',
    vto: '/v1/vto-v2',
};

type BflSubmitResponse = {
    id: string;
    polling_url: string;
};

type BflPollResponse = {
    id?: string;
    status: string;
    result?: { sample?: string };
    error?: string;
};

@Injectable()
export class BflProvider {
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(BflProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('BFL_API_KEY') ?? '';
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (toolId !== AiToolId.FLUX) {
            throw new Error(`BFL supports only Flux tool, got ${toolId}`);
        }

        const operation = this.resolveFluxOperation(input);
        const endpoint = FLUX_ENDPOINTS[operation];
        const body = this.buildFluxBody(operation, input);
        const response = await this.post<BflSubmitResponse>(endpoint, body);

        if (!response.polling_url) {
            throw new Error('BFL did not return polling_url');
        }

        return {
            providerJobId: `${BFL_JOB_PREFIX}${response.polling_url}`,
            estimatedTokenCost: 0,
        };
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        this.ensureApiKey();

        const pollingUrl = providerJobId.startsWith(BFL_JOB_PREFIX)
            ? providerJobId.slice(BFL_JOB_PREFIX.length)
            : providerJobId;

        const result = await this.get<BflPollResponse>(pollingUrl);
        const status = this.mapStatus(result.status);

        if (status === 'completed' && result.result?.sample) {
            const sampleUrl = result.result.sample;
            try {
                const { buffer, mimeType } = await downloadRemoteFile(sampleUrl);
                return {
                    status,
                    result: {
                        type: this.inferResultType(sampleUrl, mimeType),
                        buffer,
                        mimeType,
                        url: sampleUrl,
                    },
                };
            } catch (error) {
                this.logger.warn(
                    { err: error instanceof Error ? error.message : error },
                    'BFL result download failed, returning URL',
                );
                return {
                    status,
                    result: { type: 'image', url: sampleUrl },
                };
            }
        }

        if (status === 'failed') {
            return {
                status,
                errorMessage:
                    result.error ??
                    `BFL generation failed (${result.status})`,
            };
        }

        return { status };
    }

    private resolveFluxOperation(input: AiGenerationInput): FluxOperation {
        const images =
            input.files?.filter((file) => file.mimeType.startsWith('image/')) ??
            [];
        const roles = input.attachmentRoles ?? [];

        if (input.outpaintWidth && input.outpaintHeight) {
            return 'outpaint';
        }

        if (roles.includes('mask') || (roles.includes('source') && images.length >= 2)) {
            return 'erase';
        }

        if (
            roles.includes('person') &&
            roles.includes('garment') &&
            images.length >= 2
        ) {
            return 'vto';
        }

        if (images.length === 1 && !input.prompt?.trim()) {
            return 'deblur';
        }

        return 'pro';
    }

    private buildFluxBody(
        operation: FluxOperation,
        input: AiGenerationInput,
    ): Record<string, unknown> {
        switch (operation) {
            case 'outpaint':
                return this.buildOutpaintBody(input);
            case 'erase':
                return this.buildEraseBody(input);
            case 'deblur':
                return this.buildDeblurBody(input);
            case 'vto':
                return this.buildVtoBody(input);
            default:
                return this.buildFlux2ProBody(input);
        }
    }

    private buildFlux2ProBody(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const prompt = input.prompt?.trim();
        if (!prompt) {
            throw new Error('Опишите, что нужно сгенерировать или изменить');
        }

        const body: Record<string, unknown> = { prompt };

        const dimensions = aspectRatioToDimensions(
            input.aspectRatio ?? '16:9',
            input.quality,
        );
        body.width = dimensions.width;
        body.height = dimensions.height;

        const images = input.files?.filter((file) =>
            file.mimeType.startsWith('image/'),
        );
        if (images?.length) {
            images.slice(0, 8).forEach((file, index) => {
                const key =
                    index === 0 ? 'input_image' : `input_image_${index + 1}`;
                body[key] = fileToBase64(file);
            });
        }

        if (input.quality === 'high') {
            body.safety_tolerance = 2;
        }

        body.output_format = 'jpeg';

        return body;
    }

    private buildOutpaintBody(
        input: AiGenerationInput,
    ): Record<string, unknown> {
        const image = input.files?.find((file) =>
            file.mimeType.startsWith('image/'),
        );
        if (!image) {
            throw new Error('Загрузите изображение для расширения кадра');
        }

        const body: Record<string, unknown> = {
            input_image: fileToBase64(image),
            width: input.outpaintWidth ?? 1024,
            height: input.outpaintHeight ?? 1024,
            output_format: 'png',
        };

        if (input.outpaintOffsetX !== undefined) {
            body.reference_offset_x = input.outpaintOffsetX;
        }
        if (input.outpaintOffsetY !== undefined) {
            body.reference_offset_y = input.outpaintOffsetY;
        }
        if (input.prompt?.trim()) {
            body.prompt = input.prompt.trim();
        }

        return body;
    }

    private buildEraseBody(input: AiGenerationInput): Record<string, unknown> {
        const images = input.files?.filter((file) =>
            file.mimeType.startsWith('image/'),
        );
        if ((images?.length ?? 0) < 2) {
            throw new Error(
                'Загрузите изображение и маску (второе фото) для удаления объекта',
            );
        }

        const roles = input.attachmentRoles ?? [];
        let source = images![0];
        let mask = images![1];

        const sourceIdx = roles.findIndex((role) => role === 'source');
        const maskIdx = roles.findIndex((role) => role === 'mask');
        if (sourceIdx >= 0) source = images![sourceIdx];
        if (maskIdx >= 0) mask = images![maskIdx];

        return {
            input_image: fileToBase64(source),
            mask_image: fileToBase64(mask),
            output_format: 'png',
        };
    }

    private buildDeblurBody(input: AiGenerationInput): Record<string, unknown> {
        const image = input.files?.find((file) =>
            file.mimeType.startsWith('image/'),
        );
        if (!image) {
            throw new Error('Загрузите размытое изображение для улучшения');
        }

        return {
            input_image: fileToBase64(image),
            output_format: 'jpeg',
        };
    }

    private buildVtoBody(input: AiGenerationInput): Record<string, unknown> {
        const images = input.files?.filter((file) =>
            file.mimeType.startsWith('image/'),
        );
        if ((images?.length ?? 0) < 2) {
            throw new Error(
                'Загрузите фото человека и фото одежды для Virtual Try-On',
            );
        }

        const roles = input.attachmentRoles ?? [];
        let person = images![0];
        let garment = images![1];

        const personIdx = roles.findIndex((role) => role === 'person');
        const garmentIdx = roles.findIndex((role) => role === 'garment');
        if (personIdx >= 0) person = images![personIdx];
        if (garmentIdx >= 0) garment = images![garmentIdx];

        const body: Record<string, unknown> = {
            input_image: fileToBase64(person),
            input_image_2: fileToBase64(garment),
            output_format: 'jpeg',
        };

        if (input.prompt?.trim()) {
            body.prompt = input.prompt.trim();
        }

        return body;
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (normalized === 'ready') return 'completed';
        if (
            ['error', 'failed', 'request moderated', 'content moderated'].includes(
                normalized,
            )
        ) {
            return 'failed';
        }
        if (['pending', 'queued'].includes(normalized)) return 'pending';
        return 'processing';
    }

    private inferResultType(
        url: string,
        mimeType: string,
    ): 'image' | 'video' {
        if (
            mimeType.startsWith('video/') ||
            url.includes('.mp4') ||
            url.includes('.webm')
        ) {
            return 'video';
        }
        return 'image';
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('BFL_API_KEY is not configured');
        }
    }

    private getHeaders(): Record<string, string> {
        return {
            accept: 'application/json',
            'Content-Type': 'application/json',
            'x-key': this.apiKey,
        };
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        const url = path.startsWith('http') ? path : `${BFL_BASE_URL}${path}`;
        const response = await firstValueFrom(
            this.httpService.post<T>(url, data, {
                headers: this.getHeaders(),
                timeout: 120000,
            }),
        );
        return response.data;
    }

    private async get<T>(url: string): Promise<T> {
        const response = await firstValueFrom(
            this.httpService.get<T>(url, {
                headers: {
                    accept: 'application/json',
                    'x-key': this.apiKey,
                },
                timeout: 60000,
            }),
        );
        return response.data;
    }
}

function fileToBase64(file: AiFileInput): string {
    return file.buffer.toString('base64');
}

export function aspectRatioToDimensions(
    aspectRatio: string,
    quality?: string,
): { width: number; height: number } {
    const [wRaw, hRaw] = aspectRatio.split(':');
    const w = Number(wRaw);
    const h = Number(hRaw);
    if (!w || !h) {
        return { width: 1440, height: 810 };
    }

    let base = 1024;
    if (quality === 'high') base = 1440;
    else if (quality === 'low') base = 768;

    let width: number;
    let height: number;

    if (w >= h) {
        width = base;
        height = Math.round((base * h) / w);
    } else {
        height = base;
        width = Math.round((base * w) / h);
    }

    width = Math.max(64, roundToMultiple(width, 32));
    height = Math.max(64, roundToMultiple(height, 32));

    return { width, height };
}

function roundToMultiple(value: number, multiple: number): number {
    return Math.round(value / multiple) * multiple;
}
