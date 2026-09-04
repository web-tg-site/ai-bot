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
import imageSize from 'image-size';
import { downloadRemoteFile } from '@/common/utils/download-remote-file';
import { isImageMedia } from '@/common/utils/media-kind';
import { FLUX_OUTPAINT_CANVAS } from '@/common/config/flux-image-modes.config';

const BFL_BASE_URL = 'https://api.bfl.ai';
export const BFL_JOB_PREFIX = 'bfl|';

/** BFL rejects an outpaint canvas above 4 MP (2048×2048) with a 422. */
const OUTPAINT_MAX_PIXELS = 2048 * 2048;
/** Room left around the source for the model to paint into. */
const OUTPAINT_EXPAND_FACTOR = 1.35;
const OUTPAINT_CANVAS_STEP = 32;
const OUTPAINT_MIN_SIDE = 64;

type FluxOperation = 'pro' | 'outpaint' | 'deblur' | 'vto';

const FLUX_ENDPOINTS: Record<FluxOperation, string> = {
    pro: '/v1/flux-2-pro',
    outpaint: '/v1/flux-tools/outpainting-v1',
    deblur: '/v1/flux-tools/deblur-v1',
    vto: '/v1/flux-tools/vto-v2',
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
        const body = await this.buildFluxBody(operation, input);
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
                const { buffer, mimeType } =
                    await downloadRemoteFile(sampleUrl);
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
                    result.error ?? `BFL generation failed (${result.status})`,
            };
        }

        return { status };
    }

    private resolveFluxOperation(input: AiGenerationInput): FluxOperation {
        const explicit = input.fluxImageMode;
        if (explicit === 'outpaint') return 'outpaint';
        if (explicit === 'deblur') return 'deblur';
        if (explicit === 'try_on') return 'vto';
        if (explicit === 'generate') return 'pro';

        const images =
            input.files?.filter((file) =>
                isImageMedia(file.mimeType, file.fileName),
            ) ?? [];
        const roles = input.attachmentRoles ?? [];

        if (input.outpaintWidth && input.outpaintHeight) {
            return 'outpaint';
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

    private async buildFluxBody(
        operation: FluxOperation,
        input: AiGenerationInput,
    ): Promise<Record<string, unknown>> {
        switch (operation) {
            case 'outpaint':
                return this.buildOutpaintBody(input);
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
            isImageMedia(file.mimeType, file.fileName),
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

    /**
     * The canvas has to be built from the real source size: a fixed 1024×1024
     * frame is smaller than the 1600px uploads the mini-app sends, so BFL
     * centred the reference out of bounds and answered 422. Here the canvas is
     * grown around the source under the requested aspect ratio, and the source
     * is downscaled when the 4 MP canvas budget cannot hold it.
     */
    private async buildOutpaintBody(
        input: AiGenerationInput,
    ): Promise<Record<string, unknown>> {
        const image = input.files?.find((file) =>
            isImageMedia(file.mimeType, file.fileName),
        );
        if (!image) {
            throw new Error('Загрузите изображение для расширения кадра');
        }

        const source = this.readImageSize(image);
        const canvas = source
            ? this.resolveOutpaintCanvas(source, input.aspectRatio)
            : {
                  width: input.outpaintWidth ?? FLUX_OUTPAINT_CANVAS.width,
                  height: input.outpaintHeight ?? FLUX_OUTPAINT_CANVAS.height,
              };

        const reference = source
            ? await this.fitReferenceIntoCanvas(image, source, canvas)
            : { file: image, width: null, height: null };

        const body: Record<string, unknown> = {
            input_image: fileToBase64(reference.file),
            width: canvas.width,
            height: canvas.height,
            // Cheap insurance: rounding may leave the reference a pixel over the
            // edge, and without auto_crop that is a 422 instead of a result.
            auto_crop: true,
            output_format: 'png',
        };

        if (reference.width != null && reference.height != null) {
            body.reference_offset_x = Math.max(
                0,
                Math.floor((canvas.width - reference.width) / 2),
            );
            body.reference_offset_y = Math.max(
                0,
                Math.floor((canvas.height - reference.height) / 2),
            );
        }

        if (input.prompt?.trim()) {
            body.prompt = input.prompt.trim();
        }

        return body;
    }

    private readImageSize(
        file: AiFileInput,
    ): { width: number; height: number } | null {
        try {
            const size = imageSize(file.buffer);
            if (!size.width || !size.height) return null;
            return { width: size.width, height: size.height };
        } catch (error) {
            this.logger.warn(
                { err: error instanceof Error ? error.message : error },
                'BFL outpaint: could not read source size, falling back to preset canvas',
            );
            return null;
        }
    }

    /**
     * Grows the canvas around the source: at least `OUTPAINT_EXPAND_FACTOR` on
     * the tighter side, more on the other when the target ratio asks for it.
     * Sides are floored to a multiple of 32 so the result stays under 4 MP.
     */
    private resolveOutpaintCanvas(
        source: { width: number; height: number },
        aspectRatio: string | undefined,
    ): { width: number; height: number } {
        const ratio =
            this.resolveOutpaintRatio(aspectRatio) ??
            source.width / source.height;

        let height = Math.max(
            source.height * OUTPAINT_EXPAND_FACTOR,
            (source.width * OUTPAINT_EXPAND_FACTOR) / ratio,
        );
        let width = height * ratio;

        const pixels = width * height;
        if (pixels > OUTPAINT_MAX_PIXELS) {
            const scale = Math.sqrt(OUTPAINT_MAX_PIXELS / pixels);
            width *= scale;
            height *= scale;
        }

        return {
            width: floorToCanvasStep(width),
            height: floorToCanvasStep(height),
        };
    }

    private resolveOutpaintRatio(
        aspectRatio: string | undefined,
    ): number | null {
        if (!aspectRatio) return null;
        const [wRaw, hRaw] = aspectRatio.split(':');
        const w = Number(wRaw);
        const h = Number(hRaw);
        if (!w || !h) return null;
        return w / h;
    }

    /**
     * A 4 MP canvas can end up smaller than the upload. Shrinking the reference
     * keeps the whole frame visible instead of letting `auto_crop` cut it.
     */
    private async fitReferenceIntoCanvas(
        file: AiFileInput,
        source: { width: number; height: number },
        canvas: { width: number; height: number },
    ): Promise<{ file: AiFileInput; width: number; height: number }> {
        const scale = Math.min(
            canvas.width / source.width,
            canvas.height / source.height,
            1,
        );
        if (scale >= 1) {
            return { file, width: source.width, height: source.height };
        }

        const width = Math.max(1, Math.floor(source.width * scale));
        const height = Math.max(1, Math.floor(source.height * scale));

        try {
            const sharp = (await import('sharp')).default;
            const buffer = await sharp(file.buffer)
                .rotate()
                .resize({ width, height, fit: 'inside' })
                .png()
                .toBuffer();
            const resized = this.readImageSize({ ...file, buffer });
            return {
                file: { ...file, buffer, mimeType: 'image/png' },
                width: resized?.width ?? width,
                height: resized?.height ?? height,
            };
        } catch (error) {
            this.logger.warn(
                { err: error instanceof Error ? error.message : error },
                'BFL outpaint: source downscale failed, relying on auto_crop',
            );
            return { file, width: source.width, height: source.height };
        }
    }

    private buildDeblurBody(input: AiGenerationInput): Record<string, unknown> {
        const image = input.files?.find((file) =>
            isImageMedia(file.mimeType, file.fileName),
        );
        if (!image) {
            throw new Error('Загрузите размытое изображение для улучшения');
        }

        // BFL deblur expects `image`, not `input_image`.
        return {
            image: fileToBase64(image),
            output_format: 'jpeg',
        };
    }

    private buildVtoBody(input: AiGenerationInput): Record<string, unknown> {
        const images = input.files?.filter((file) =>
            isImageMedia(file.mimeType, file.fileName),
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

        // BFL VTO expects `person` + `garment` + required `prompt`.
        return {
            person: fileToBase64(person),
            garment: fileToBase64(garment),
            prompt:
                input.prompt?.trim() ||
                'Dress the person in the garment naturally, keep identity and pose.',
            output_format: 'jpeg',
        };
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (normalized === 'ready') return 'completed';
        if (
            [
                'error',
                'failed',
                'request moderated',
                'content moderated',
            ].includes(normalized)
        ) {
            return 'failed';
        }
        if (['pending', 'queued'].includes(normalized)) return 'pending';
        return 'processing';
    }

    private inferResultType(url: string, mimeType: string): 'image' | 'video' {
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
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(url, data, {
                    headers: this.getHeaders(),
                    timeout: 120000,
                }),
            );
            return response.data;
        } catch (error) {
            throw new Error(this.formatHttpError(error, `POST ${path}`));
        }
    }

    private async get<T>(url: string): Promise<T> {
        try {
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
        } catch (error) {
            throw new Error(this.formatHttpError(error, 'GET status'));
        }
    }

    private formatHttpError(error: unknown, action: string): string {
        const axiosError = error as {
            response?: { status?: number; data?: unknown };
            message?: string;
        };
        const status = axiosError.response?.status;
        const detail = extractBflErrorDetail(axiosError.response?.data);

        if (status === 422) {
            return detail
                ? `Проверьте фото для Flux: ${detail}`
                : 'Flux не принял запрос (неверные параметры или фото). Попробуйте другое изображение.';
        }

        if (status === 403) {
            return 'Flux сейчас недоступен для этого режима. Попробуйте позже или другой режим.';
        }

        if (status === 429) {
            return 'Flux перегружен. Подождите немного и попробуйте снова.';
        }

        this.logger.warn(
            {
                action,
                status,
                detail,
                message: axiosError.message,
            },
            'BFL request failed',
        );

        if (detail) {
            return detail;
        }

        return axiosError.message?.includes('status code')
            ? 'Не удалось выполнить запрос к Flux. Попробуйте другое фото или позже.'
            : axiosError.message || 'BFL request failed';
    }
}

function extractBflErrorDetail(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') {
        return undefined;
    }

    const record = data as {
        detail?: unknown;
        error?: unknown;
        message?: unknown;
    };

    if (typeof record.detail === 'string' && record.detail.trim()) {
        return record.detail.trim();
    }

    if (Array.isArray(record.detail)) {
        const parts = record.detail
            .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const row = item as { loc?: unknown; msg?: unknown };
                const msg = typeof row.msg === 'string' ? row.msg : null;
                if (!msg) return null;
                const loc = Array.isArray(row.loc)
                    ? row.loc
                          .filter((part) => typeof part === 'string')
                          .join('.')
                    : '';
                return loc ? `${loc}: ${msg}` : msg;
            })
            .filter(Boolean);
        if (parts.length) {
            return parts.join('; ');
        }
    }

    if (typeof record.error === 'string' && record.error.trim()) {
        return record.error.trim();
    }
    if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim();
    }

    return undefined;
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

/** Floors, never rounds up: rounding up could push the canvas over 4 MP. */
function floorToCanvasStep(value: number): number {
    const stepped =
        Math.floor(value / OUTPAINT_CANVAS_STEP) * OUTPAINT_CANVAS_STEP;
    return Math.max(OUTPAINT_MIN_SIDE, stepped);
}
