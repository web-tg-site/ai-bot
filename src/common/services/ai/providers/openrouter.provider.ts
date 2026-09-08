import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    AiFileInput,
    AiGenerationInput,
    AiGenerationResult,
    AiJobCreateResult,
    AiJobStatusResult,
    AiToolId,
} from '../types';
import { getToolById } from '@/common/config/ai-tools.registry';
import { parseDataUrl } from '@/common/utils/parse-data-url';
import { pcm16ToWav } from '@/common/utils/pcm16-to-wav';
import {
    containsCyrillic,
    SOUND_EFFECT_TRANSLATION_SYSTEM_PROMPT,
    wrapSoundEffectPrompt,
} from '@/common/utils/sound-effect-prompt';
import { getI18n } from '@/common/services/bot/i18n';
import { toUserFacingError } from '@/common/services/bot/errors/bot-error.mapper';
import { splitMediaFiles } from '@/common/utils/normalize-upload-mime';
import {
    isAudioMedia,
    isImageMedia,
    isVideoMedia,
} from '@/common/utils/media-kind';
import {
    fallbackDocumentName,
    guessDocumentMime,
    isPdfDocument,
    isPlainTextDocument,
} from '@/common/utils/document-file.util';
import { compressReferenceImage } from '@/common/utils/compress-reference-image';
import {
    extractOfficeContent,
    type OfficeExtractedContent,
} from '@/common/utils/extract-office-text.util';
import {
    attachmentMentionSystemHint,
    formatAttachmentMention,
    getAttachmentMentionIndex1,
    getAttachmentMentionKind,
} from '@/common/services/bot/utils/image-references';

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_DOCUMENT_CHARS = 12_000;
/** Office text is extracted locally — allow more than plain TXT paste. */
const MAX_OFFICE_TEXT_CHARS = 100_000;

type OpenRouterFilePart = {
    type: 'file';
    file: { filename: string; file_data: string };
};

type OpenRouterMessageContent =
    | string
    | Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string } }
          | OpenRouterFilePart
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
            case AiToolId.CLAUDE_SONNET:
                return this.chatClaude(input);
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

    async prepareSoundEffectPrompt(userDescription: string): Promise<string> {
        const trimmed = userDescription.trim();
        if (!trimmed) {
            return '';
        }

        let description = trimmed;

        if (containsCyrillic(trimmed)) {
            try {
                const response = await this.post<{
                    choices?: Array<{
                        message?: { content?: string };
                    }>;
                }>('/chat/completions', {
                    model: 'openai/gpt-4o-mini',
                    temperature: 0.2,
                    max_tokens: 120,
                    messages: [
                        {
                            role: 'system',
                            content: SOUND_EFFECT_TRANSLATION_SYSTEM_PROMPT,
                        },
                        { role: 'user', content: trimmed },
                    ],
                });

                const translated =
                    response.choices?.[0]?.message?.content?.trim();
                if (translated) {
                    description = translated.replace(/^["']|["']$/g, '');
                }
            } catch (error) {
                this.logger.warn(
                    {
                        err:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    'Sound effect prompt translation failed, using original text',
                );
            }
        }

        return wrapSoundEffectPrompt(description);
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

        const { images, videos, audios } = splitMediaFiles(input.files);
        const hasVisualMedia = images.length > 0 || videos.length > 0;
        const prompt = this.resolveGenerationPrompt(
            input.prompt,
            hasVisualMedia,
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

        if (input.quality) {
            body.quality = input.quality;
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
            return {
                status,
                errorMessage:
                    'Сбой на стороне провайдера. Попробуйте позже или выберите другой инструмент.',
            };
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

        return durationSeconds;
    }

    private buildVideoImagePayload(input: AiGenerationInput): {
        frame_images: Array<{
            type: 'image_url';
            image_url: { url: string };
            frame_type: 'first_frame' | 'last_frame';
        }>;
        input_references: Array<
            | {
                  type: 'image_url';
                  image_url: { url: string };
              }
            | {
                  type: 'video_url';
                  video_url: { url: string };
              }
            | {
                  type: 'audio_url';
                  audio_url: { url: string };
              }
        >;
    } {
        const { images, videos, audios } = splitMediaFiles(input.files);

        const toData = (
            file: NonNullable<AiGenerationInput['files']>[number],
        ) => `data:${file.mimeType};base64,${file.buffer.toString('base64')}`;

        const toFrame = (
            file: NonNullable<AiGenerationInput['files']>[number],
            frame_type: 'first_frame' | 'last_frame',
        ) => ({
            type: 'image_url' as const,
            image_url: { url: toData(file) },
            frame_type,
        });

        const input_references: Array<
            | { type: 'image_url'; image_url: { url: string } }
            | { type: 'video_url'; video_url: { url: string } }
            | { type: 'audio_url'; audio_url: { url: string } }
        > = [
            ...videos.map((file) => ({
                type: 'video_url' as const,
                video_url: { url: toData(file) },
            })),
            ...audios.map((file) => ({
                type: 'audio_url' as const,
                audio_url: { url: toData(file) },
            })),
        ];

        if (!images.length) {
            return { frame_images: [], input_references };
        }

        if (images.length === 1) {
            return {
                frame_images: [toFrame(images[0], 'first_frame')],
                input_references,
            };
        }

        const middle = images.slice(1, -1);
        return {
            frame_images: [
                toFrame(images[0], 'first_frame'),
                toFrame(images[images.length - 1], 'last_frame'),
            ],
            input_references: [
                ...middle.map((file) => ({
                    type: 'image_url' as const,
                    image_url: { url: toData(file) },
                })),
                ...input_references,
            ],
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

    async synthesizeGptSpeech(
        text: string,
    ): Promise<{ buffer: Buffer; mimeType: string; tokenCost: number }> {
        this.ensureApiKey();
        return this.synthesizeSpeech(text);
    }

    private async chatClaude(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        return this.chatWithReplyMode(input, AiToolId.CLAUDE_SONNET, () =>
            this.resolveClaudeModel(),
        );
    }

    private async chatWithReplyMode(
        input: AiGenerationInput,
        toolId: AiToolId.GPT | AiToolId.CLAUDE_SONNET,
        resolveModel: () => { model: string; tokenCost: number },
    ): Promise<AiGenerationResult> {
        const replyMode = input.gptReplyMode ?? 'text';

        if (replyMode === 'audio') {
            const textResult = await this.chatUnified(
                input,
                toolId,
                resolveModel,
            );
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

        const textResult = await this.chatUnified(input, toolId, resolveModel);

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

    private resolveClaudeModel(): {
        model: string;
        tokenCost: number;
    } {
        return {
            model:
                getToolById(AiToolId.CLAUDE_SONNET)?.model ??
                'anthropic/claude-sonnet-4.6',
            tokenCost: 15,
        };
    }

    private async chatUnified(
        input: AiGenerationInput,
        toolId: AiToolId.GPT | AiToolId.CLAUDE_SONNET,
        resolveModel: () => { model: string; tokenCost: number },
    ): Promise<AiGenerationResult> {
        const prompt = input.prompt ?? '';
        const { model, tokenCost } = resolveModel();

        const messages: Array<{
            role: string;
            content: OpenRouterMessageContent;
        }> = [
            {
                role: 'system',
                content: this.buildSystemPrompt(toolId, input.localeTag),
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
                        content: await this.buildUserContent(
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

        const userContent = await this.buildUserContent(
            prompt,
            input.files,
            input.localeTag,
        );
        messages.push({ role: 'user', content: userContent });

        const body: Record<string, unknown> = {
            model,
            messages,
            tools: [
                { type: 'openrouter:web_search', max_results: 5 },
                { type: 'openrouter:datetime' },
            ],
        };

        if (
            this.hasOpenRouterFileParts(userContent) ||
            messages.some((message) =>
                this.hasOpenRouterFileParts(message.content),
            )
        ) {
            // Lets OpenRouter parse DOCX/XLSX/PPTX (and PDFs) before Claude.
            body.plugins = [{ id: 'file-parser' }];
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

    private buildSystemPrompt(
        toolId: AiToolId.GPT | AiToolId.CLAUDE_SONNET,
        localeTag?: 'ru-RU' | 'en-US',
    ): string {
        const date = new Date().toLocaleDateString(localeTag ?? 'ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const identityEn =
            toolId === AiToolId.CLAUDE_SONNET
                ? 'You are Claude Sonnet, created by Anthropic. If asked who you are or which model you are, say you are Claude Sonnet by Anthropic. Never claim to be ChatGPT, GPT, or created by OpenAI.'
                : 'You are GPT, powered by OpenAI models. If asked who you are or which model you are, say you are GPT. Do not claim to be Claude or created by Anthropic.';

        const identityRu =
            toolId === AiToolId.CLAUDE_SONNET
                ? 'Ты — Claude Sonnet, созданный компанией Anthropic. Если спрашивают, кто ты или какая ты нейросеть — отвечай, что ты Claude Sonnet от Anthropic. Никогда не называй себя ChatGPT, GPT и не говори, что тебя создала OpenAI.'
                : 'Ты — GPT на моделях OpenAI. Если спрашивают, кто ты или какая ты нейросеть — отвечай, что ты GPT. Не называй себя Claude и не говори, что тебя создала Anthropic.';

        if (localeTag === 'en-US') {
            return (
                `${identityEn} Today is ${date}. ` +
                'If the question is about current events, prices, weather, news, or anything time-sensitive, use web search. ' +
                'Do not invent up-to-date facts. Always reply in English by default, even if an attached document is in another language. Switch language only when the user explicitly asks. ' +
                'When images are attached, you can see and analyze them (including people) and should give concrete visual feedback — do not claim you cannot see images. ' +
                'When a PDF, Word, Excel, PowerPoint or text document is attached, you can read it. Office files are pre-extracted into text (and slide images for PPTX) before they reach you. Never say you cannot read PPTX/DOCX/XLSX, never call them unreadable binary, and never ask the user to convert to PDF — analyze the extracted contents. ' +
                `${attachmentMentionSystemHint('en-US')} ` +
                'Use Markdown formatting (bold, lists, code) when it improves readability.'
            );
        }

        return (
            `${identityRu} Сегодня ${date}. ` +
            'Если вопрос касается текущих событий, цен, погоды, новостей или другой актуальной информации — используй поиск в интернете. ' +
            'Не выдумывай актуальные факты. По умолчанию всегда отвечай на русском, даже если прикреплённый документ на другом языке. Переходи на другой язык только если пользователь явно попросил. ' +
            'Если в сообщении есть изображения — ты их видишь и должен анализировать (в том числе людей, например для стилевых советов), а не отвечать, что не видишь изображения. ' +
            'Если прикреплён PDF, Word, Excel, PowerPoint или текстовый документ — ты его читаешь. Office-файлы заранее превращаются в текст (для PPTX ещё и в картинки слайдов). Никогда не говори, что не умеешь читать PPTX/DOCX/XLSX, не называй их «сырыми бинарными данными» и не проси конвертировать в PDF — анализируй извлечённое содержимое. ' +
            `${attachmentMentionSystemHint('ru-RU')} ` +
            'Используй Markdown-форматирование (жирный текст, списки, код), когда это улучшает читаемость.'
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

        const userContent = await this.buildUserContent(
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
            body.resolution = this.normalizeImageResolutionForModel(
                model,
                input.resolution,
            );
        }

        if (input.quality) {
            body.quality = input.quality;
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

    private normalizeImageResolutionForModel(
        model: string,
        resolution: string,
    ): string {
        if (!model.startsWith('bytedance-seed/seedream')) {
            return resolution;
        }
        // Seedream 4.5 needs >= ~3.7M pixels; OpenRouter maps 1K → 1024².
        if (resolution === '1K' || resolution === '512') {
            return '2K';
        }
        return resolution;
    }

    private async buildUserContent(
        prompt: string,
        files?: AiGenerationInput['files'],
        localeTag: 'ru-RU' | 'en-US' = 'ru-RU',
    ): Promise<OpenRouterMessageContent> {
        if (!files?.length) {
            return prompt;
        }

        const parts: Array<
            | { type: 'text'; text: string }
            | { type: 'image_url'; image_url: { url: string } }
            | OpenRouterFilePart
        > = [];

        if (prompt) {
            parts.push({ type: 'text', text: prompt });
        }

        for (let i = 0; i < files.length; i += 1) {
            const file = files[i]!;
            const mention = formatAttachmentMention(
                getAttachmentMentionKind(file),
                getAttachmentMentionIndex1(files, i),
            );

            if (isImageMedia(file.mimeType, file.fileName)) {
                const base64 = file.buffer.toString('base64');
                const mime = file.mimeType?.startsWith('image/')
                    ? file.mimeType
                    : 'image/jpeg';
                parts.push({ type: 'text', text: mention });
                parts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${mime};base64,${base64}`,
                    },
                });
                continue;
            }

            if (isVideoMedia(file.mimeType, file.fileName)) {
                parts.push({
                    type: 'text',
                    text:
                        localeTag === 'en-US'
                            ? `${mention} Attached video: ${file.fileName ?? 'video'} — video analysis is not supported in this chat`
                            : `${mention} Прикреплено видео: ${file.fileName ?? 'video'} — анализ видео в этом чате не поддерживается`,
                });
                continue;
            }

            if (isAudioMedia(file.mimeType, file.fileName)) {
                parts.push({
                    type: 'text',
                    text:
                        localeTag === 'en-US'
                            ? `${mention} Attached audio: ${file.fileName ?? 'audio'} — audio analysis is not supported in this chat`
                            : `${mention} Прикреплено аудио: ${file.fileName ?? 'audio'} — анализ аудио в этом чате не поддерживается`,
                });
                continue;
            }

            parts.push({ type: 'text', text: mention });
            parts.push(...(await this.buildDocumentParts(file, localeTag)));
        }

        return parts;
    }

    private hasOpenRouterFileParts(content: OpenRouterMessageContent): boolean {
        if (typeof content === 'string') {
            return false;
        }
        return content.some((part) => part.type === 'file');
    }

    /**
     * PDF → OpenRouter `type: "file"` (Claude native / file-parser).
     * DOCX/XLSX/PPTX → local text (+ PPTX slide rasters). Sending Office
     * binaries through OpenRouter file-parser often hangs until client timeout.
     */
    private async buildDocumentParts(
        file: AiFileInput,
        localeTag: 'ru-RU' | 'en-US',
    ): Promise<
        Array<
            | { type: 'text'; text: string }
            | { type: 'image_url'; image_url: { url: string } }
            | OpenRouterFilePart
        >
    > {
        if (file.buffer.byteLength > MAX_DOCUMENT_BYTES) {
            throw new Error(
                localeTag === 'en-US'
                    ? 'The attached file is too large. Maximum is 20 MB.'
                    : 'Прикреплённый файл слишком большой. Максимум 20 МБ.',
            );
        }

        if (isPdfDocument(file)) {
            const filename =
                file.fileName?.trim() || fallbackDocumentName(file);
            const mime = guessDocumentMime(filename, file.mimeType);
            return [
                {
                    type: 'file',
                    file: {
                        filename,
                        file_data: `data:${mime};base64,${file.buffer.toString('base64')}`,
                    },
                },
            ];
        }

        try {
            const office = await extractOfficeContent(
                file.buffer,
                file.fileName,
                file.mimeType,
            );
            if (office) {
                const parts = await this.partsFromOfficeContent(
                    file,
                    office,
                    localeTag,
                );
                if (parts.length) {
                    return parts;
                }
                return [
                    {
                        type: 'text',
                        text:
                            localeTag === 'en-US'
                                ? `The file "${file.fileName ?? 'document'}" was opened, but no text or slide images could be extracted.`
                                : `Файл «${file.fileName ?? 'document'}» открыт, но текст и картинки слайдов извлечь не удалось.`,
                    },
                ];
            }
        } catch (error) {
            this.logger.warn(
                {
                    err: error instanceof Error ? error.message : String(error),
                    fileName: file.fileName,
                },
                'Office text extraction failed',
            );
            return [
                {
                    type: 'text',
                    text:
                        localeTag === 'en-US'
                            ? `[Could not read "${file.fileName ?? 'document'}". Re-save as PDF or TXT and send again.]`
                            : `[Не удалось прочитать «${file.fileName ?? 'document'}». Сохраните как PDF или TXT и отправьте снова.]`,
                },
            ];
        }

        if (isPlainTextDocument(file)) {
            const textContent = file.buffer
                .toString('utf-8')
                .slice(0, MAX_TEXT_DOCUMENT_CHARS);
            return [
                {
                    type: 'text',
                    text:
                        localeTag === 'en-US'
                            ? `Contents of ${file.fileName ?? 'document'}:\n${textContent}`
                            : `Содержимое файла ${file.fileName ?? 'document'}:\n${textContent}`,
                },
            ];
        }

        return [
            {
                type: 'text',
                text:
                    localeTag === 'en-US'
                        ? `[Attached file "${file.fileName ?? 'document'}" — this chat can analyze PDF, DOCX, XLSX, PPTX and text files. Convert the document to one of those formats and send it again.]`
                        : `[Прикреплён файл «${file.fileName ?? 'document'}» — в этом чате разбираются PDF, DOCX, XLSX, PPTX и текстовые файлы. Сохраните документ в одном из этих форматов и отправьте снова.]`,
            },
        ];
    }

    private async partsFromOfficeContent(
        file: AiFileInput,
        office: OfficeExtractedContent,
        localeTag: 'ru-RU' | 'en-US',
    ): Promise<
        Array<
            | { type: 'text'; text: string }
            | { type: 'image_url'; image_url: { url: string } }
        >
    > {
        const sliced = office.text.slice(0, MAX_OFFICE_TEXT_CHARS);
        const truncated =
            office.text.length > MAX_OFFICE_TEXT_CHARS
                ? localeTag === 'en-US'
                    ? '\n\n[Document truncated for length.]'
                    : '\n\n[Документ обрезан из‑за длины.]'
                : '';
        const hasText = Boolean(sliced.trim());
        if (!hasText && !office.images.length) {
            return [];
        }

        const name = file.fileName ?? 'document';
        const header =
            localeTag === 'en-US'
                ? hasText
                    ? `Extracted contents of "${name}" (already parsed — do not say you cannot read PPTX/DOCX/XLSX and do not ask for a PDF):\n${sliced}${truncated}`
                    : `No extractable text in "${name}". Slide images follow. Do not say you cannot read PPTX and do not ask for a PDF.`
                : hasText
                  ? `Извлечённое содержимое «${name}» (файл уже прочитан — не говори, что не умеешь читать PPTX/DOCX/XLSX, и не проси PDF):\n${sliced}${truncated}`
                  : `В «${name}» нет извлекаемого текста. Ниже изображения слайдов. Не говори, что не умеешь читать PPTX, и не проси PDF.`;

        const parts: Array<
            | { type: 'text'; text: string }
            | { type: 'image_url'; image_url: { url: string } }
        > = [{ type: 'text', text: header }];

        for (const image of office.images) {
            let compressed;
            try {
                compressed = await compressReferenceImage({
                    buffer: image.buffer,
                    mimeType: image.mimeType,
                    fileName: image.fileName,
                });
            } catch {
                continue;
            }
            parts.push({
                type: 'text',
                text:
                    localeTag === 'en-US'
                        ? `[Slide ${image.slideIndex}]`
                        : `[Слайд ${image.slideIndex}]`,
            });
            parts.push({
                type: 'image_url',
                image_url: {
                    url: `data:${compressed.mimeType};base64,${compressed.buffer.toString('base64')}`,
                },
            });
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
                    timeout: 300000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `OpenRouter POST ${path} failed: ${this.extractRawError(error)}`,
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
                `OpenRouter GET ${path} failed: ${this.extractRawError(error)}`,
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
        return this.humanizeValidationMessage(this.extractRawError(error));
    }

    private extractRawError(error: unknown): string {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as {
                response?: {
                    status?: number;
                    data?: unknown;
                };
            };

            const extracted = this.extractApiErrorData(
                axiosError.response?.data,
            );
            if (extracted) {
                return extracted;
            }

            if (axiosError.response?.status) {
                return `Сбой на стороне провайдера (HTTP ${axiosError.response.status}).`;
            }
        }

        return error instanceof Error
            ? error.message
            : 'Сбой на стороне провайдера';
    }

    private extractApiErrorData(data: unknown): string | undefined {
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
                return this.parseValidationMessage(nested);
            }
            if (nested && typeof nested === 'object' && 'message' in nested) {
                const message = (nested as { message?: unknown }).message;
                if (typeof message === 'string') {
                    return this.parseValidationMessage(message);
                }
            }
        }

        if ('message' in data && typeof data.message === 'string') {
            return this.parseValidationMessage(data.message);
        }

        return undefined;
    }

    private parseValidationMessage(message: string): string {
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

    private humanizeValidationMessage(message: string): string {
        return toUserFacingError(
            this.parseValidationMessage(message),
            getI18n(),
        );
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

        return lines.length ? lines.join('\n') : 'Ошибка параметров запроса.';
    }
}
