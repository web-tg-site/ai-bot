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
import { pcm16ToWav } from '@/common/utils/pcm16-to-wav';

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
                return this.chatGpt(input);
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

        const images =
            input.files?.filter((file) => file.mimeType.startsWith('image/')) ??
            [];
        const prompt = this.resolveGenerationPrompt(
            input.prompt,
            images.length > 0,
            'video',
        );

        if (!prompt) {
            throw new Error(
                'Отправьте текстовый промпт или фото для генерации видео',
            );
        }

        const body: Record<string, unknown> = {
            model: tool.model,
            prompt,
            aspect_ratio: input.aspectRatio ?? '16:9',
            resolution: input.resolution ?? '720p',
            duration: this.resolveVideoDuration(
                toolId,
                input.durationSeconds ?? tool.defaultDurationSeconds ?? 5,
            ),
        };

        const { frame_images, input_references } =
            this.buildVideoImagePayload(input);
        if (frame_images.length) {
            body.frame_images = frame_images;
        }
        if (input_references.length) {
            body.input_references = input_references;
        }

        if (input.videoStylePassthrough) {
            Object.assign(body, input.videoStylePassthrough);
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

    private buildVideoImagePayload(input: AiGenerationInput): {
        frame_images: Array<{
            type: 'image_url';
            image_url: { url: string };
            frame_type: 'first_frame' | 'last_frame';
        }>;
        input_references: Array<{
            type: 'image_url';
            image_url: { url: string };
        }>;
    } {
        const images =
            input.files?.filter((file) => file.mimeType.startsWith('image/')) ??
            [];

        if (!images.length) {
            return { frame_images: [], input_references: [] };
        }

        const toFrame = (
            file: NonNullable<AiGenerationInput['files']>[number],
            frame_type: 'first_frame' | 'last_frame',
        ) => ({
            type: 'image_url' as const,
            image_url: {
                url: `data:${file.mimeType};base64,${file.buffer.toString('base64')}`,
            },
            frame_type,
        });

        const toReference = (
            file: NonNullable<AiGenerationInput['files']>[number],
        ) => ({
            type: 'image_url' as const,
            image_url: {
                url: `data:${file.mimeType};base64,${file.buffer.toString('base64')}`,
            },
        });

        if (images.length === 1) {
            return {
                frame_images: [toFrame(images[0], 'first_frame')],
                input_references: [],
            };
        }

        const middle = images.slice(1, -1);

        return {
            frame_images: [
                toFrame(images[0], 'first_frame'),
                toFrame(images[images.length - 1], 'last_frame'),
            ],
            input_references: middle.map(toReference),
        };
    }

    private resolveGenerationPrompt(
        prompt: string | undefined,
        hasImages: boolean,
        mode: 'image' | 'video',
    ): string {
        const trimmed = prompt?.trim();
        if (trimmed) {
            return trimmed;
        }

        if (!hasImages) {
            return '';
        }

        return mode === 'video'
            ? 'Создай плавное видео с переходом между кадрами'
            : 'Создай изображение по референсу';
    }

    private async chatGpt(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const replyMode = input.gptReplyMode ?? 'text';

        if (replyMode === 'audio') {
            const textResult = await this.chatUnified(input);
            const speech = await this.synthesizeSpeech(textResult.text ?? '');
            return {
                type: 'audio',
                buffer: speech.buffer,
                mimeType: speech.mimeType,
                text: textResult.text,
                actualTokenCost:
                    (textResult.actualTokenCost ?? 0) + speech.tokenCost,
            };
        }

        const textResult = await this.chatUnified(input);

        if (replyMode === 'both' && textResult.text) {
            const speech = await this.synthesizeSpeech(textResult.text);
            return {
                ...textResult,
                voiceBuffer: speech.buffer,
                voiceMimeType: speech.mimeType,
                actualTokenCost:
                    (textResult.actualTokenCost ?? 0) + speech.tokenCost,
            };
        }

        return textResult;
    }

    private async chatUnified(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const hasMedia = (input.files?.length ?? 0) > 0;
        const prompt = input.prompt ?? '';
        const webSearchEnabled = input.gptWebSearch !== false;
        const wantsSearch = webSearchEnabled || this.detectSearchIntent(prompt);

        let model: string;
        let tokenCost: number;

        if (wantsSearch) {
            model = 'openai/gpt-4o';
            tokenCost = webSearchEnabled ? 8 : 15;
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
        }> = [
            {
                role: 'system',
                content: this.buildSystemPrompt(input.localeTag),
            },
        ];

        if (input.chatHistory?.length) {
            for (const msg of input.chatHistory.slice(-10)) {
                if (msg.role === 'system') {
                    continue;
                }

                if (msg.role === 'user' && msg.files?.length) {
                    messages.push({
                        role: msg.role,
                        content: this.buildUserContent(
                            msg.content,
                            msg.files,
                            input.localeTag,
                        ),
                    });
                    continue;
                }

                messages.push({ role: msg.role, content: msg.content });
            }
        }

        const userContent = this.buildUserContent(
            prompt,
            input.files,
            input.localeTag,
        );
        messages.push({ role: 'user', content: userContent });

        const body: Record<string, unknown> = { model, messages };

        if (wantsSearch) {
            body.tools = [
                { type: 'openrouter:web_search', max_results: 5 },
                { type: 'openrouter:datetime' },
            ];
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

    private buildSystemPrompt(localeTag?: 'ru-RU' | 'en-US'): string {
        const date = new Date().toLocaleDateString(localeTag ?? 'ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        if (localeTag === 'en-US') {
            return (
                `Today is ${date}. ` +
                'If the question is about current events, prices, weather, news, or anything time-sensitive, use web search. ' +
                'Do not invent up-to-date facts. Answer in the same language as the user.'
            );
        }

        return (
            `Сегодня ${date}. ` +
            'Если вопрос касается текущих событий, цен, погоды, новостей или другой актуальной информации — используй поиск в интернете. ' +
            'Не выдумывай актуальные факты. Отвечай на том же языке, что и пользователь.'
        );
    }

    private async synthesizeSpeech(
        text: string,
    ): Promise<{ buffer: Buffer; mimeType: string; tokenCost: number }> {
        const trimmed = text.trim().slice(0, 2000);
        if (!trimmed) {
            throw new Error('Пустой текст для озвучки');
        }

        const messages = [
            {
                role: 'system',
                content:
                    'You are a TTS engine. Speak ONLY the value of TEXT_TO_SPEAK. No greetings, no follow-up, no commentary.',
            },
            {
                role: 'user',
                content: `TEXT_TO_SPEAK=${JSON.stringify(trimmed)}`,
            },
        ];

        const pcm = await this.streamAudioPcm(messages);
        const wav = pcm16ToWav(pcm);

        return {
            buffer: wav,
            mimeType: 'audio/wav',
            tokenCost: Math.max(3, Math.ceil(trimmed.length / 250)),
        };
    }

    private async streamAudioPcm(
        messages: Array<{ role: string; content: string }>,
    ): Promise<Buffer> {
        const response = await firstValueFrom(
            this.httpService.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: 'openai/gpt-audio-mini',
                    stream: true,
                    messages,
                    modalities: ['text', 'audio'],
                    audio: { voice: 'alloy', format: 'pcm16' },
                },
                {
                    headers: this.getHeaders(),
                    responseType: 'stream',
                    timeout: 120000,
                },
            ),
        );

        const stream = response.data as NodeJS.ReadableStream;
        const chunks: Buffer[] = [];
        let buffer = '';

        for await (const chunk of stream) {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) {
                    continue;
                }

                const payload = line.slice(6).trim();
                if (!payload || payload === '[DONE]') {
                    continue;
                }

                try {
                    const json = JSON.parse(payload) as {
                        choices?: Array<{
                            delta?: {
                                audio?: { data?: string };
                            };
                        }>;
                    };
                    const data = json.choices?.[0]?.delta?.audio?.data;
                    if (data) {
                        chunks.push(Buffer.from(data, 'base64'));
                    }
                } catch {
                    // skip malformed chunk
                }
            }
        }

        if (!chunks.length) {
            throw new Error('Не удалось получить аудио от модели');
        }

        return Buffer.concat(chunks);
    }

    private async generateImage(
        model: string,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const images =
            input.files?.filter((file) => file.mimeType.startsWith('image/')) ??
            [];
        const prompt = this.resolveGenerationPrompt(
            input.prompt,
            images.length > 0,
            'image',
        );

        if (!prompt) {
            throw new Error(
                'Отправьте текстовый промпт или фото для генерации изображения',
            );
        }

        if (this.usesDedicatedImagesApi(model)) {
            return this.generateImageViaImagesApi(model, input, prompt);
        }

        const userContent = this.buildUserContent(
            prompt,
            input.files,
            input.localeTag,
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
        prompt: string,
    ): Promise<AiGenerationResult> {
        const body: Record<string, unknown> = {
            model,
            prompt,
        };

        if (input.aspectRatio) {
            body.aspect_ratio = input.aspectRatio;
        }

        if (input.resolution) {
            body.resolution = input.resolution;
        }

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
            model.startsWith('bytedance-seed/seedream') ||
            model.startsWith('openai/gpt-') ||
            (model.includes('gemini') && model.includes('image'))
        );
    }

    private buildUserContent(
        prompt: string,
        files?: AiGenerationInput['files'],
        localeTag: 'ru-RU' | 'en-US' = 'ru-RU',
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

        let imageIndex = 0;
        for (const file of files) {
            if (file.mimeType.startsWith('image/')) {
                const base64 = file.buffer.toString('base64');
                const label =
                    localeTag === 'en-US'
                        ? `[Reference ${imageIndex + 1}]`
                        : `[Референс ${imageIndex + 1}]`;
                imageIndex += 1;
                parts.push({ type: 'text', text: label });
                parts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${file.mimeType};base64,${base64}`,
                    },
                });
            } else if (file.mimeType.startsWith('video/')) {
                parts.push({
                    type: 'text',
                    text:
                        localeTag === 'en-US'
                            ? `[Attached video: ${file.fileName ?? 'video'} — video analysis is not supported in this chat]`
                            : `[Прикреплено видео: ${file.fileName ?? 'video'} — анализ видео в этом чате не поддерживается]`,
                });
            } else if (
                file.mimeType.startsWith('audio/') ||
                file.mimeType.startsWith('voice/')
            ) {
                parts.push({
                    type: 'text',
                    text:
                        localeTag === 'en-US'
                            ? `[Attached audio: ${file.fileName ?? 'audio'} — audio analysis is not supported in this chat]`
                            : `[Прикреплено аудио: ${file.fileName ?? 'audio'} — анализ аудио в этом чате не поддерживается]`,
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
                    data?: unknown;
                };
            };

            const humanized = this.humanizeApiError(axiosError.response?.data);
            if (humanized) {
                return humanized;
            }

            if (axiosError.response?.status) {
                return `OpenRouter API error: HTTP ${axiosError.response.status}`;
            }
        }

        return error instanceof Error ? error.message : 'OpenRouter API error';
    }

    private humanizeApiError(data: unknown): string | undefined {
        if (!data) {
            return undefined;
        }

        if (Array.isArray(data)) {
            return this.humanizeValidationErrors(
                data as Array<{ path?: unknown[]; message?: string }>,
            );
        }

        if (typeof data !== 'object') {
            return undefined;
        }

        if ('error' in data) {
            const nested = (data as { error?: unknown }).error;
            if (typeof nested === 'string') {
                return this.humanizeValidationMessage(nested);
            }
            if (nested && typeof nested === 'object' && 'message' in nested) {
                const message = (nested as { message?: unknown }).message;
                if (typeof message === 'string') {
                    return this.humanizeValidationMessage(message);
                }
            }
        }

        if ('message' in data && typeof data.message === 'string') {
            return this.humanizeValidationMessage(data.message);
        }

        return undefined;
    }

    private humanizeValidationMessage(message: string): string {
        try {
            const parsed: unknown = JSON.parse(message);
            if (Array.isArray(parsed)) {
                return this.humanizeValidationErrors(
                    parsed as Array<{ path?: unknown[]; message?: string }>,
                );
            }
        } catch {
            // not JSON
        }

        return message;
    }

    private humanizeValidationErrors(
        errors: Array<{ path?: unknown[]; message?: string }>,
    ): string {
        const lines = errors
            .map((entry) => {
                const path = Array.isArray(entry.path)
                    ? entry.path.join('.')
                    : '';
                if (path && entry.message) {
                    return `${path}: ${entry.message}`;
                }
                return entry.message;
            })
            .filter(Boolean);

        return lines.length
            ? lines.join('\n')
            : 'Ошибка валидации запроса к OpenRouter';
    }
}
