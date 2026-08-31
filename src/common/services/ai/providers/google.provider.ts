import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    GoogleGenAI,
    GenerateVideosOperation,
    VideoGenerationReferenceType,
} from '@google/genai';
import { getToolById } from '@/common/config/ai-tools.registry';
import { splitMediaFiles } from '@/common/utils/normalize-upload-mime';
import {
    AiFileInput,
    AiGenerationInput,
    AiGenerationResult,
    AiJobCreateResult,
    AiJobStatusResult,
    AiToolId,
} from '../types';

const NANO_MODEL = 'gemini-3.1-flash-image';
const VEO_MODEL = 'veo-3.1-generate-preview';
const VEO_ASPECT_RATIOS = new Set(['16:9', '9:16']);
const VEO_DURATIONS = [4, 6, 8] as const;

type InteractionInputPart =
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mime_type: string }
    | { type: 'video'; data: string; mime_type: string };

@Injectable()
export class GoogleProvider {
    private readonly apiKey: string;
    private readonly client: GoogleGenAI | null;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(GoogleProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('GEMINI_API_KEY') ?? '';
        this.client = this.apiKey
            ? new GoogleGenAI({ apiKey: this.apiKey })
            : null;
    }

    async generate(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        this.ensureApiKey();

        if (toolId !== AiToolId.NANO_BANANA) {
            throw new Error(
                `Google sync generate not supported for ${toolId}`,
            );
        }

        try {
            return await this.generateNanoBanana(input);
        } catch (error) {
            this.logger.error(
                {
                    toolId,
                    err: this.formatProviderError(error),
                },
                'Nano Banana generation failed',
            );
            throw error;
        }
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (toolId !== AiToolId.VEO) {
            throw new Error(`Google async jobs only support Veo, got ${toolId}`);
        }

        try {
            const operation = await this.startVeoGeneration(input);
            if (!operation.name) {
                throw new Error('Gemini did not return Veo operation name');
            }

            this.logger.info(
                {
                    toolId,
                    providerJobId: operation.name,
                    aspectRatio: input.aspectRatio,
                    resolution: input.resolution,
                    durationSeconds: input.durationSeconds,
                    veoMode: input.veoMode ?? 'create',
                },
                'Veo createJob started',
            );

            return {
                providerJobId: operation.name,
                estimatedTokenCost: 0,
            };
        } catch (error) {
            const err = this.formatProviderError(error);
            this.logger.error(
                {
                    toolId,
                    err,
                    // Keep a plain string copy — Railway filters often match message only.
                },
                `Veo createJob failed: ${err}`,
            );
            throw error instanceof Error
                ? error
                : new Error(`Veo createJob failed: ${err}`);
        }
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        this.ensureApiKey();
        const client = this.getClient();

        try {
            // SDK requires a real GenerateVideosOperation instance (has _fromAPIResponse),
            // not a plain { name } object.
            const seed = new GenerateVideosOperation();
            seed.name = providerJobId;
            const operation = await client.operations.getVideosOperation({
                operation: seed,
            });

            if (operation.error) {
                const message =
                    typeof operation.error === 'object' &&
                    operation.error !== null &&
                    'message' in operation.error
                        ? String(
                              (operation.error as { message?: unknown }).message,
                          )
                        : 'Veo generation failed';
                this.logger.warn(
                    {
                        providerJobId,
                        err: message,
                        operationError: operation.error,
                    },
                    `Veo operation reported error: ${message}`,
                );
                return {
                    status: 'failed',
                    errorMessage: message || 'Veo generation failed',
                };
            }

            if (!operation.done) {
                return { status: 'processing' };
            }

            const generated =
                operation.response?.generatedVideos?.[0]?.video;
            if (!generated) {
                const filtered =
                    operation.response?.raiMediaFilteredReasons?.join('; ') ??
                    'Veo завершил задачу без видео';
                this.logger.warn(
                    { providerJobId, err: filtered },
                    `Veo finished without video: ${filtered}`,
                );
                return { status: 'failed', errorMessage: filtered };
            }

            if (generated.videoBytes) {
                return {
                    status: 'completed',
                    result: {
                        type: 'video',
                        buffer: Buffer.from(generated.videoBytes, 'base64'),
                        mimeType: generated.mimeType ?? 'video/mp4',
                    },
                };
            }

            if (generated.uri) {
                const { buffer, mimeType } = await this.downloadWithApiKey(
                    generated.uri,
                    generated.mimeType ?? 'video/mp4',
                );
                return {
                    status: 'completed',
                    result: {
                        type: 'video',
                        buffer,
                        mimeType,
                        url: generated.uri,
                    },
                };
            }

            return {
                status: 'failed',
                errorMessage: 'Veo завершил задачу без данных видео',
            };
        } catch (error) {
            const err = this.formatProviderError(error);
            this.logger.warn(
                {
                    providerJobId,
                    err,
                },
                `Veo getJobStatus failed: ${err}`,
            );
            // Transient poll/SDK errors should not kill the job — cron will retry.
            throw error instanceof Error
                ? error
                : new Error(`Veo getJobStatus failed: ${err}`);
        }
    }

    private async generateNanoBanana(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const tool = getToolById(AiToolId.NANO_BANANA);
        const model = tool?.model ?? NANO_MODEL;
        const { images, videos } = splitMediaFiles(input.files);
        const prompt = this.resolvePrompt(
            input.prompt,
            images.length > 0 || videos.length > 0,
            'image',
        );

        if (!prompt && !input.googlePreviousInteractionId) {
            throw new Error(
                'Отправьте текстовый промпт или медиа для генерации изображения',
            );
        }

        const parts: InteractionInputPart[] = [];
        if (prompt) {
            parts.push({ type: 'text', text: prompt });
        }

        for (const file of images) {
            parts.push({
                type: 'image',
                data: file.buffer.toString('base64'),
                mime_type: file.mimeType || 'image/png',
            });
        }
        for (const file of videos) {
            parts.push({
                type: 'video',
                data: file.buffer.toString('base64'),
                mime_type: file.mimeType || 'video/mp4',
            });
        }

        const aspectRatio = input.aspectRatio ?? '1:1';
        const imageSize = this.normalizeImageSize(input.resolution);
        const thinkingLevel =
            input.nanoThinkingLevel === 'high' ? 'high' : 'minimal';

        const interactionInput =
            parts.length === 1 && parts[0].type === 'text'
                ? parts[0].text
                : parts;

        const request: Record<string, unknown> = {
            model,
            input: interactionInput,
            store: true,
            response_format: {
                type: 'image',
                // Gemini image models currently accept only JPEG for output.
                mime_type: 'image/jpeg',
                aspect_ratio: aspectRatio,
                image_size: imageSize,
            },
            generation_config: {
                thinking_level: thinkingLevel,
            },
        };

        if (input.googlePreviousInteractionId) {
            request.previous_interaction_id = input.googlePreviousInteractionId;
        }

        request.tools = [
            {
                type: 'google_search',
                search_types: ['web_search', 'image_search'],
            },
        ];

        const interaction = (await this.getClient().interactions.create(
            request as Parameters<GoogleGenAI['interactions']['create']>[0],
        )) as {
            id: string;
            output_image?: { data?: string; mime_type?: string };
        };

        const image = interaction.output_image;
        if (!image?.data) {
            throw new Error('Gemini не вернул изображение');
        }

        return {
            type: 'image',
            buffer: Buffer.from(image.data, 'base64'),
            mimeType: image.mime_type ?? 'image/jpeg',
            googleInteractionId: interaction.id,
        };
    }

    private async startVeoGeneration(
        input: AiGenerationInput,
    ): Promise<GenerateVideosOperation> {
        const tool = getToolById(AiToolId.VEO);
        const model = tool?.model ?? VEO_MODEL;
        const { images, videos } = splitMediaFiles(input.files);
        const isExtend = input.veoMode === 'extend';

        const prompt = this.resolvePrompt(
            input.prompt,
            images.length > 0 || videos.length > 0,
            'video',
        );

        if (!prompt && !isExtend && images.length === 0) {
            throw new Error(
                'Отправьте текстовый промпт или фото для генерации видео',
            );
        }

        const aspectRatio = this.normalizeVeoAspect(input.aspectRatio);
        let resolution = this.normalizeVeoResolution(input.resolution);
        const roles = input.attachmentRoles ?? [];
        const refRoleCount = roles.filter((role) => role === 'reference').length;
        const hasExplicitRefs = refRoleCount > 0;
        const hasFirstLast =
            roles.includes('start_frame') || roles.includes('end_frame');

        if (isExtend) {
            resolution = '720p';
        }

        const needsFixedEight =
            isExtend ||
            hasExplicitRefs ||
            resolution === '1080p' ||
            resolution === '4k';

        const durationSeconds = needsFixedEight
            ? 8
            : this.snapVeoDuration(input.durationSeconds ?? 4);

        const hasImageInput = images.length > 0 || isExtend;
        const config: Record<string, unknown> = {
            aspectRatio,
            resolution,
            durationSeconds,
            numberOfVideos: 1,
        };

        // Gemini Veo personGeneration rules (AI Studio / Gemini API):
        // - text-to-video: omit or allow_all (allow_adult is rejected)
        // - image-to-video: allow_adult (or omit)
        if (hasImageInput) {
            config.personGeneration = 'allow_adult';
        } else {
            config.personGeneration = 'allow_all';
        }

        if (input.negativePrompt?.trim()) {
            config.negativePrompt = input.negativePrompt.trim();
        }

        this.logger.info(
            {
                model,
                aspectRatio,
                resolution,
                durationSeconds,
                personGeneration: config.personGeneration,
                veoMode: isExtend ? 'extend' : 'create',
                hasImageInput,
                hasExplicitRefs,
                promptLength: prompt.length,
            },
            'Veo generateVideos request',
        );

        if (isExtend) {
            const sourceVideo = videos[0];
            if (!sourceVideo && !input.sourceGenerationId) {
                throw new Error(
                    'Для продления Veo прикрепите исходное видео (720p, до 141 сек)',
                );
            }

            const videoPayload = sourceVideo
                ? {
                      videoBytes: sourceVideo.buffer.toString('base64'),
                      mimeType: sourceVideo.mimeType || 'video/mp4',
                  }
                : undefined;

            return this.getClient().models.generateVideos({
                model,
                source: {
                    prompt: prompt || undefined,
                    video: videoPayload,
                },
                config: {
                    ...config,
                    // Extend clip length must be a supported Veo duration.
                    durationSeconds: 8,
                    resolution: '720p',
                },
            });
        }

        if (hasExplicitRefs) {
            const refImages = this.pickFilesByRoles(
                input.files ?? [],
                roles,
                ['reference'],
                (file) => file.mimeType.startsWith('image/'),
            ).slice(0, 3);
            if (!refImages.length) {
                throw new Error('Добавьте до 3 reference-изображений для Veo');
            }
            if (!prompt) {
                throw new Error(
                    'Для reference images нужен текстовый промпт',
                );
            }

            return this.getClient().models.generateVideos({
                model,
                source: { prompt },
                config: {
                    ...config,
                    durationSeconds: 8,
                    referenceImages: refImages.map((file) => ({
                        image: this.toGeminiImage(file),
                        referenceType: VideoGenerationReferenceType.ASSET,
                    })),
                },
            });
        }

        const { first, last } = this.resolveFirstLastFrames(
            input.files ?? [],
            images,
            roles,
            hasFirstLast,
        );

        if (last && !first) {
            throw new Error(
                'Last frame требует first frame — прикрепите стартовый кадр',
            );
        }

        if (last) {
            config.lastFrame = this.toGeminiImage(last);
        }

        return this.getClient().models.generateVideos({
            model,
            source: {
                prompt: prompt || undefined,
                image: first ? this.toGeminiImage(first) : undefined,
            },
            config,
        });
    }

    private resolveFirstLastFrames(
        files: AiFileInput[],
        images: AiFileInput[],
        roles: NonNullable<AiGenerationInput['attachmentRoles']>,
        hasExplicitRoles: boolean,
    ): { first?: AiFileInput; last?: AiFileInput } {
        if (!images.length) {
            return {};
        }

        if (hasExplicitRoles) {
            const starts = this.pickFilesByRoles(
                files,
                roles,
                ['start_frame'],
                (file) => file.mimeType.startsWith('image/'),
            );
            const ends = this.pickFilesByRoles(
                files,
                roles,
                ['end_frame'],
                (file) => file.mimeType.startsWith('image/'),
            );
            return {
                first: starts[0] ?? images[0],
                last: ends[0],
            };
        }

        if (images.length === 1) {
            return { first: images[0] };
        }

        return {
            first: images[0],
            last: images[images.length - 1],
        };
    }

    private pickFilesByRoles(
        files: AiFileInput[],
        roles: NonNullable<AiGenerationInput['attachmentRoles']>,
        wanted: Array<'start_frame' | 'end_frame' | 'reference'>,
        filter?: (file: AiFileInput) => boolean,
    ): AiFileInput[] {
        const result: AiFileInput[] = [];
        for (let i = 0; i < files.length; i++) {
            const role = roles[i];
            if (!role || !wanted.includes(role as (typeof wanted)[number])) {
                continue;
            }
            if (filter && !filter(files[i])) {
                continue;
            }
            result.push(files[i]);
        }
        return result;
    }

    private toGeminiImage(file: AiFileInput) {
        return {
            imageBytes: file.buffer.toString('base64'),
            mimeType: file.mimeType || 'image/png',
        };
    }

    private normalizeImageSize(resolution?: string): string {
        if (!resolution) return '1K';
        if (resolution === '0.5K' || resolution === '0.5k') return '512';
        if (resolution === '512') return '512';
        const upper = resolution.toUpperCase();
        if (upper === '1K' || upper === '2K' || upper === '4K') {
            return upper;
        }
        return '1K';
    }

    private normalizeVeoAspect(aspectRatio?: string): string {
        if (aspectRatio && VEO_ASPECT_RATIOS.has(aspectRatio)) {
            return aspectRatio;
        }
        return '16:9';
    }

    private normalizeVeoResolution(resolution?: string): string {
        const value = (resolution ?? '720p').toLowerCase();
        if (value === '4k' || value === '2160p') return '4k';
        if (value === '1080p') return '1080p';
        return '720p';
    }

    private snapVeoDuration(durationSeconds: number): number {
        return VEO_DURATIONS.reduce((closest, value) =>
            Math.abs(value - durationSeconds) <
            Math.abs(closest - durationSeconds)
                ? value
                : closest,
        );
    }

    private resolvePrompt(
        prompt: string | undefined,
        hasMedia: boolean,
        kind: 'image' | 'video',
    ): string {
        const trimmed = prompt?.trim() ?? '';
        if (trimmed) return trimmed;
        if (!hasMedia) return '';
        return kind === 'image'
            ? 'Edit or improve the attached media based on visual context.'
            : 'Animate the attached media into a short cinematic clip.';
    }

    private async downloadWithApiKey(
        url: string,
        fallbackMime: string,
    ): Promise<{ buffer: Buffer; mimeType: string }> {
        const response = await firstValueFrom(
            this.httpService.get<ArrayBuffer>(url, {
                responseType: 'arraybuffer',
                headers: { 'x-goog-api-key': this.apiKey },
                timeout: 180_000,
                maxContentLength: 200 * 1024 * 1024,
                maxBodyLength: 200 * 1024 * 1024,
            }),
        );
        const mimeType =
            (response.headers?.['content-type'] as string | undefined)?.split(
                ';',
            )[0] ?? fallbackMime;
        return { buffer: Buffer.from(response.data), mimeType };
    }

    private ensureApiKey(): void {
        if (!this.apiKey || !this.client) {
            this.logger.error('GEMINI_API_KEY is not configured');
            throw new Error('GEMINI_API_KEY is not configured');
        }
    }

    private getClient(): GoogleGenAI {
        this.ensureApiKey();
        return this.client!;
    }

    private formatProviderError(error: unknown): string {
        if (!(error instanceof Error)) {
            return String(error);
        }

        const extras: Record<string, unknown> = {};
        const anyError = error as Error & {
            status?: unknown;
            code?: unknown;
            error?: unknown;
            cause?: unknown;
            response?: unknown;
        };
        if (anyError.status !== undefined) extras.status = anyError.status;
        if (anyError.code !== undefined) extras.code = anyError.code;
        if (anyError.error !== undefined) extras.error = anyError.error;
        if (anyError.response !== undefined) extras.response = anyError.response;
        if (anyError.cause !== undefined) {
            extras.cause =
                anyError.cause instanceof Error
                    ? anyError.cause.message
                    : anyError.cause;
        }

        // Google GenAI often puts the useful text in error.error.message
        const nestedMessage = (() => {
            const nested = anyError.error;
            if (!nested || typeof nested !== 'object') return null;
            const msg = (nested as { message?: unknown }).message;
            return typeof msg === 'string' && msg.trim() ? msg.trim() : null;
        })();

        const base =
            nestedMessage && !error.message.includes(nestedMessage)
                ? `${error.message}: ${nestedMessage}`
                : error.message || nestedMessage || 'Unknown Google API error';

        if (!Object.keys(extras).length) {
            return base;
        }

        try {
            return `${base} | ${JSON.stringify(extras).slice(0, 800)}`;
        } catch {
            return base;
        }
    }
}
