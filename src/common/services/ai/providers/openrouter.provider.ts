import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    AiGenerationInput,
    AiGenerationResult,
    AiJobCreateResult,
    AiJobStatusResult,
} from '../types';
import { getToolById } from '@/common/config/ai-tools.registry';
import { AiToolId } from '../types';
import { parseDataUrl } from '@/common/utils/parse-data-url';

type OpenRouterMessageContent =
    | string
    | Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string } }
      >;

@Injectable()
export class OpenRouterProvider {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://openrouter.ai/api/v1';

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(OpenRouterProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('OPENROUTER_API_KEY') ?? '';
    }

    async generate(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        this.ensureApiKey();

        switch (toolId) {
            case AiToolId.GPT:
                return this.chatUnified(input);
            case AiToolId.GPT_IMAGES:
            case AiToolId.FLUX:
            case AiToolId.NANO_BANANA:
            case AiToolId.SEEDREAM: {
                const tool = getToolById(toolId);
                if (!tool?.model) {
                    throw new Error(`Model not configured for ${toolId}`);
                }
                return this.generateImage(tool.model, input);
            }
            default:
                throw new Error(
                    `OpenRouter sync generate not supported for ${toolId}`,
                );
        }
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        const tool = getToolById(toolId);
        if (!tool?.model) {
            throw new Error(`Model not configured for ${toolId}`);
        }

        const body: Record<string, unknown> = {
            model: tool.model,
            prompt: input.prompt ?? '',
            aspect_ratio: '16:9',
            duration: this.resolveVideoDuration(
                toolId,
                input.durationSeconds ?? tool.defaultDurationSeconds ?? 5,
            ),
        };

        const frameImages = this.buildFrameImages(input);
        if (frameImages.length) {
            body.frame_images = frameImages;
        }

        const response = await this.post<{
            id: string;
            polling_url?: string;
            status?: string;
        }>('/videos', body);

        if (!response.id) {
            throw new Error('OpenRouter did not return video job id');
        }

        return {
            providerJobId: response.id,
            estimatedTokenCost: 0,
        };
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        this.ensureApiKey();

        const response = await this.get<{
            status: string;
            unsigned_urls?: string[];
            error?: string | { message?: string };
        }>(`/videos/${providerJobId}`);

        const status = this.mapStatus(response.status);

        if (status === 'completed') {
            const videoUrl =
                response.unsigned_urls?.[0] ??
                `${this.baseUrl}/videos/${providerJobId}/content`;

            return {
                status,
                result: { type: 'video', url: videoUrl },
            };
        }

        if (status === 'failed') {
            const errorMessage =
                typeof response.error === 'string'
                    ? response.error
                    : (response.error?.message ?? 'Video generation failed');

            return { status, errorMessage };
        }

        return { status };
    }

    private resolveVideoDuration(
        toolId: AiToolId,
        durationSeconds: number,
    ): number {
        if (toolId === AiToolId.VEO) {
            const allowed = [4, 6, 8];
            return allowed.reduce((closest, value) =>
                Math.abs(value - durationSeconds) <
                Math.abs(closest - durationSeconds)
                    ? value
                    : closest,
            );
        }

        if (toolId === AiToolId.KLING) {
            return Math.min(15, Math.max(3, durationSeconds));
        }

        return durationSeconds;
    }

    private buildFrameImages(input: AiGenerationInput): Array<{
        image_url: { url: string };
        frame_type: 'first_frame';
    }> {
        const imageFile = input.files?.find((file) =>
            file.mimeType.startsWith('image/'),
        );
        if (!imageFile) {
            return [];
        }

        return [
            {
                image_url: {
                    url: `data:${imageFile.mimeType};base64,${imageFile.buffer.toString('base64')}`,
                },
                frame_type: 'first_frame',
            },
        ];
    }

    private async chatUnified(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const hasMedia = (input.files?.length ?? 0) > 0;
        const prompt = input.prompt ?? '';
        const wantsSearch =
            input.gptMode === 'search' || this.detectSearchIntent(prompt);

        let model: string;
        let tokenCost: number;

        if (wantsSearch) {
            model = 'openai/gpt-4o';
            tokenCost = 15;
        } else if (hasMedia) {
            model = 'openai/gpt-4o';
            tokenCost = 8;
        } else if (prompt.length > 200) {
            model = 'openai/gpt-4o';
            tokenCost = 5;
        } else {
            model = 'openai/gpt-4o-mini';
            tokenCost = 1;
        }

        const messages: Array<{
            role: string;
            content: OpenRouterMessageContent;
        }> = [];

        if (input.chatHistory?.length) {
            for (const msg of input.chatHistory.slice(-10)) {
                messages.push({ role: msg.role, content: msg.content });
            }
        }

        const userContent = this.buildUserContent(prompt, input.files);
        messages.push({ role: 'user', content: userContent });

        const body: Record<string, unknown> = { model, messages };

        if (wantsSearch) {
            body.plugins = [{ id: 'web', max_results: 5 }];
        }

        const response = await this.post<{
            choices: Array<{
                message: {
                    content?: string;
                    images?: Array<{ image_url?: { url?: string } }>;
                };
            }>;
        }>('/chat/completions', body);

        const message = response.choices[0]?.message;

        return {
            type: 'text',
            text: message?.content ?? 'Пустой ответ от модели.',
            actualTokenCost: tokenCost,
        };
    }

    private async generateImage(
        model: string,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        if (this.usesDedicatedImagesApi(model)) {
            return this.generateImageViaImagesApi(model, input);
        }

        const userContent = this.buildUserContent(
            input.prompt ?? 'Generate an image',
            input.files,
        );

        const response = await this.post<{
            choices: Array<{
                message: {
                    content?: string;
                    images?: Array<{ image_url?: { url?: string } }>;
                };
            }>;
            data?: Array<{ url?: string; b64_json?: string }>;
        }>('/chat/completions', {
            model,
            messages: [{ role: 'user', content: userContent }],
            modalities: ['image', 'text'],
        });

        return this.parseImageResponse(response);
    }

    private async generateImageViaImagesApi(
        model: string,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const body: Record<string, unknown> = {
            model,
            prompt: input.prompt ?? 'Generate an image',
        };

        const imageFiles = input.files?.filter((file) =>
            file.mimeType.startsWith('image/'),
        );
        if (imageFiles?.length) {
            body.input_references = imageFiles.map((file) => ({
                type: 'image_url',
                image_url: {
                    url: `data:${file.mimeType};base64,${file.buffer.toString('base64')}`,
                },
            }));
        }

        const response = await this.post<{
            data?: Array<{ url?: string; b64_json?: string }>;
        }>('/images', body);

        return this.parseImageResponse(response);
    }

    private parseImageResponse(response: {
        choices?: Array<{
            message?: {
                content?: string;
                images?: Array<{ image_url?: { url?: string } }>;
            };
        }>;
        data?: Array<{ url?: string; b64_json?: string }>;
    }): AiGenerationResult {
        const imageFromMessage =
            response.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageFromMessage) {
            return this.toImageResult(imageFromMessage);
        }

        const imageFromData = response.data?.[0];
        if (imageFromData?.url) {
            return this.toImageResult(imageFromData.url);
        }
        if (imageFromData?.b64_json) {
            return {
                type: 'image',
                buffer: Buffer.from(imageFromData.b64_json, 'base64'),
                mimeType: 'image/png',
            };
        }

        const contentUrl = this.extractImageFromContent(
            response.choices?.[0]?.message?.content,
        );
        if (contentUrl) {
            return this.toImageResult(contentUrl);
        }

        throw new Error('Не удалось получить изображение от модели');
    }

    private usesDedicatedImagesApi(model: string): boolean {
        return (
            model.startsWith('black-forest-labs/flux.') ||
            model.startsWith('bytedance-seed/seedream')
        );
    }

    private buildUserContent(
        prompt: string,
        files?: AiGenerationInput['files'],
    ): OpenRouterMessageContent {
        if (!files?.length) {
            return prompt;
        }

        const parts: Array<
            | { type: 'text'; text: string }
            | { type: 'image_url'; image_url: { url: string } }
        > = [];

        if (prompt) {
            parts.push({ type: 'text', text: prompt });
        }

        for (const file of files) {
            if (file.mimeType.startsWith('image/')) {
                const base64 = file.buffer.toString('base64');
                parts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${file.mimeType};base64,${base64}`,
                    },
                });
            } else if (file.mimeType.startsWith('video/')) {
                parts.push({
                    type: 'text',
                    text: `[Прикреплено видео: ${file.fileName ?? 'video'}]`,
                });
            } else {
                const textContent = file.buffer
                    .toString('utf-8')
                    .slice(0, 12000);
                parts.push({
                    type: 'text',
                    text: `Содержимое файла ${file.fileName ?? 'document'}:\n${textContent}`,
                });
            }
        }

        return parts;
    }

    private toImageResult(url: string): AiGenerationResult {
        const parsed = parseDataUrl(url);
        if (parsed) {
            return {
                type: 'image',
                buffer: parsed.buffer,
                mimeType: parsed.mimeType,
            };
        }

        return { type: 'image', url };
    }

    private detectSearchIntent(prompt: string): boolean {
        return /(найди|поиск|актуальн|сейчас|новост|в интернете|погода)/i.test(
            prompt,
        );
    }

    private extractImageFromContent(content?: string): string | undefined {
        if (!content) return undefined;
        const match = content.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp|gif)/i);
        return match?.[0];
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (['completed', 'succeeded', 'success', 'done'].includes(normalized))
            return 'completed';
        if (['failed', 'error', 'cancelled'].includes(normalized))
            return 'failed';
        if (['processing', 'running', 'in_progress'].includes(normalized))
            return 'processing';
        if (['pending', 'queued'].includes(normalized)) return 'pending';
        return 'pending';
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY is not configured');
        }
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, data, {
                    headers: this.getHeaders(),
                    timeout: 120000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `OpenRouter POST ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private async get<T>(path: string): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<T>(`${this.baseUrl}${path}`, {
                    headers: this.getHeaders(),
                    timeout: 30000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `OpenRouter GET ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private getHeaders() {
        return {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://project-ai.bot',
            'X-OpenRouter-Title': 'PROJECT AI',
        };
    }

    private formatError(error: unknown): string {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as {
                response?: {
                    status?: number;
                    data?: { error?: { message?: string } };
                };
            };

            const message = axiosError.response?.data?.error?.message;
            if (message) {
                return message;
            }

            if (axiosError.response?.status) {
                return `OpenRouter API error: HTTP ${axiosError.response.status}`;
            }
        }

        return error instanceof Error ? error.message : 'OpenRouter API error';
    }
}
