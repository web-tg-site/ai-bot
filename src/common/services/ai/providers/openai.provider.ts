import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import OpenAI, { APIError, toFile } from 'openai';
import {
    AiFileInput,
    AiGenerationInput,
    AiGenerationResult,
    AiJobCreateResult,
    AiJobStatusResult,
    AiToolId,
} from '../types';
import { splitMediaFiles } from '@/common/utils/normalize-upload-mime';
import { resizeImageForSora } from '@/common/utils/resize-image-for-sora';
import {
    resolveSoraModel,
    resolveSoraVideoSize,
    toSoraCreateSeconds,
    toSoraExtendSeconds,
} from '@/common/utils/sora-video-params';
import { getToolById } from '@/common/config/ai-tools.registry';
import { extractVideoForGpt } from '@/common/utils/extract-video-for-gpt';
import {
    isAudioMedia,
    isImageMedia,
    isVideoMedia,
} from '@/common/utils/media-kind';
import { transcodeVideoToH264 } from '@/common/utils/transcode-video-h264';
import { OpenRouterProvider } from './openrouter.provider';

const GPT_IMAGE_MODEL = 'gpt-image-1-mini';
export const OPENAI_VIDEO_RESULT_PREFIX = 'openai-video://';

export function isOpenAiVideoResultUrl(url: string): boolean {
    return url.startsWith(OPENAI_VIDEO_RESULT_PREFIX);
}

export function buildOpenAiVideoResultUrl(providerJobId: string): string {
    return `${OPENAI_VIDEO_RESULT_PREFIX}${providerJobId}`;
}
const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const PORTRAIT_ASPECT_RATIOS = new Set(['4:5', '3:4', '2:3', '9:16']);
const IMAGE_QUALITIES = ['auto', 'low', 'medium', 'high'] as const;

type GptImageQuality = (typeof IMAGE_QUALITIES)[number];
type GptImageSize = '1024x1024' | '1536x1024' | '1024x1536';

type InputTextPart = { type: 'input_text'; text: string };
type InputImagePart = {
    type: 'input_image';
    image_url: string;
    detail: 'auto';
};
type InputFilePart = {
    type: 'input_file';
    filename: string;
    file_data: string;
};
type InputPart = InputTextPart | InputImagePart | InputFilePart;

type EasyMessage = {
    role: 'user' | 'assistant';
    content: string | InputPart[];
};

@Injectable()
export class OpenAiProvider {
    private readonly apiKey: string;
    private readonly client: OpenAI | null;

    constructor(
        configService: ConfigService,
        private readonly openRouterProvider: OpenRouterProvider,
        @InjectPinoLogger(OpenAiProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('OPENAI_API_KEY') ?? '';
        this.client = this.apiKey
            ? new OpenAI({
                  apiKey: this.apiKey,
                  timeout: 300_000,
                  maxRetries: 1,
              })
            : null;
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
                return this.generateImage(input);
            default:
                throw new Error(
                    `OpenAI sync generate not supported for ${toolId}`,
                );
        }
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        if (toolId !== AiToolId.SORA) {
            throw new Error(`OpenAI async jobs support only Sora, got ${toolId}`);
        }

        this.ensureApiKey();
        const mode = this.resolveSoraVideoMode(input);

        switch (mode) {
            case 'extend':
                return this.createSoraExtendJob(input);
            case 'edit':
                return this.createSoraEditJob(input);
            default:
                return this.createSoraCreateJob(input);
        }
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        this.ensureApiKey();
        const client = this.requireClient();

        try {
            const video = await client.videos.retrieve(providerJobId);
            const status = this.mapSoraStatus(video.status);

            if (status === 'completed') {
                const content = await client.videos.downloadContent(
                    providerJobId,
                );
                const buffer = Buffer.from(await content.arrayBuffer());

                return {
                    status,
                    result: {
                        type: 'video',
                        buffer,
                        mimeType: 'video/mp4',
                    },
                };
            }

            if (status === 'failed') {
                const message =
                    video.error?.message ??
                    video.error?.code ??
                    'Sora generation failed';

                this.logger.warn(
                    {
                        providerJobId,
                        error: video.error,
                    },
                    `Sora task failed: ${message}`,
                );

                return {
                    status,
                    errorMessage: this.formatSoraErrorMessage(message),
                };
            }

            return { status };
        } catch (error) {
            this.logger.error(
                { providerJobId, err: this.extractRawError(error) },
                'Sora job status failed',
            );
            throw new Error(this.formatSoraErrorMessage(this.extractRawError(error)));
        }
    }

    private async chatGpt(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const replyMode = input.gptReplyMode ?? 'text';
        const textResult = await this.chatUnified(input);

        if (replyMode === 'audio') {
            const speech = await this.openRouterProvider.synthesizeGptSpeech(
                textResult.text ?? '',
            );
            return {
                type: 'audio',
                buffer: speech.buffer,
                mimeType: speech.mimeType,
                text: textResult.text,
                images: textResult.images,
                actualTokenCost:
                    (textResult.actualTokenCost ?? 0) + speech.tokenCost,
            };
        }

        if (replyMode === 'both' && textResult.text) {
            const speech = await this.openRouterProvider.synthesizeGptSpeech(
                textResult.text,
            );
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

    private resolveGptModel(): {
        model: string;
        tokenCost: number;
    } {
        return { model: 'gpt-5.5', tokenCost: 8 };
    }

    private async chatUnified(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const client = this.requireClient();
        const prompt = input.prompt ?? '';
        const { model, tokenCost } = this.resolveGptModel();

        const messages: EasyMessage[] = [];

        if (input.chatHistory?.length) {
            for (const msg of input.chatHistory.slice(-10)) {
                if (msg.role === 'system') {
                    continue;
                }

                if (msg.role === 'user') {
                    messages.push({
                        role: 'user',
                        content: await this.buildUserContent(
                            msg.content,
                            msg.files,
                            input.localeTag,
                        ),
                    });
                    continue;
                }

                messages.push({ role: 'assistant', content: msg.content });
            }
        }

        messages.push({
            role: 'user',
            content: await this.buildUserContent(
                prompt,
                input.files,
                input.localeTag,
            ),
        });

        const tools: Array<
            { type: 'web_search' } | { type: 'image_generation' }
        > = [{ type: 'web_search' }, { type: 'image_generation' }];

        try {
            const response = await client.responses.create({
                model,
                instructions: this.buildSystemPrompt(input.localeTag),
                input: messages as OpenAI.Responses.ResponseInput,
                tools,
            });

            const text =
                response.output_text?.trim() ||
                (this.extractImages(response).length
                    ? ''
                    : 'Пустой ответ от модели.');
            const images = this.extractImages(response);

            return {
                type: 'text',
                text,
                images: images.length ? images : undefined,
                actualTokenCost: tokenCost,
            };
        } catch (error) {
            this.logger.error(
                { err: this.extractRawError(error) },
                'OpenAI Responses request failed',
            );
            throw new Error(this.formatError(error));
        }
    }

    private async buildUserContent(
        prompt: string,
        files?: AiFileInput[],
        localeTag: 'ru-RU' | 'en-US' = 'ru-RU',
    ): Promise<string | InputPart[]> {
        if (!files?.length) {
            return prompt;
        }

        const parts: InputPart[] = [];
        if (prompt.trim()) {
            parts.push({ type: 'input_text', text: prompt });
        }

        let imageIndex = 0;
        for (const file of files) {
            if (isImageMedia(file.mimeType, file.fileName)) {
                imageIndex += 1;
                const label =
                    localeTag === 'en-US'
                        ? `[Reference ${imageIndex}]`
                        : `[Референс ${imageIndex}]`;
                parts.push({ type: 'input_text', text: label });
                parts.push({
                    type: 'input_image',
                    image_url: `data:${file.mimeType || 'image/jpeg'};base64,${file.buffer.toString('base64')}`,
                    detail: 'auto',
                });
                continue;
            }

            if (isVideoMedia(file.mimeType, file.fileName)) {
                parts.push(...(await this.buildVideoParts(file, localeTag)));
                continue;
            }

            if (isAudioMedia(file.mimeType, file.fileName)) {
                parts.push(await this.buildAudioPart(file, localeTag));
                continue;
            }

            parts.push(this.buildDocumentPart(file, localeTag));
        }

        return parts.length ? parts : prompt || ' ';
    }

    private async buildVideoParts(
        file: AiFileInput,
        localeTag: 'ru-RU' | 'en-US',
    ): Promise<InputPart[]> {
        const extraction = await extractVideoForGpt(file.buffer, {
            mimeType: file.mimeType,
            fileName: file.fileName,
        });

        let transcript: string | undefined;
        if (extraction.audio) {
            transcript = await this.transcribeAudio(
                extraction.audio,
                'audio.mp3',
                'audio/mpeg',
            );
        }

        const header =
            localeTag === 'en-US'
                ? `Attached video "${file.fileName ?? 'video'}" (${extraction.durationSec.toFixed(1)}s). Frames below are sampled in order.`
                : `Прикреплено видео «${file.fileName ?? 'video'}» (${extraction.durationSec.toFixed(1)} с). Ниже кадры по порядку.`;
        const audioNote =
            localeTag === 'en-US'
                ? transcript
                    ? `Audio transcript (first 3 minutes if longer):\n${transcript}`
                    : 'No usable audio track was found.'
                : transcript
                  ? `Транскрипт звука (первые 3 минуты, если ролик длиннее):\n${transcript}`
                  : 'Звуковая дорожка не найдена.';

        const parts: InputPart[] = [
            { type: 'input_text', text: `${header}\n${audioNote}` },
        ];

        for (const frame of extraction.frames) {
            parts.push({
                type: 'input_text',
                text:
                    localeTag === 'en-US'
                        ? `[Frame at ${frame.timestampSec.toFixed(1)}s]`
                        : `[Кадр на ${frame.timestampSec.toFixed(1)} с]`,
            });
            parts.push({
                type: 'input_image',
                image_url: `data:image/jpeg;base64,${frame.buffer.toString('base64')}`,
                detail: 'auto',
            });
        }

        return parts;
    }

    private async buildAudioPart(
        file: AiFileInput,
        localeTag: 'ru-RU' | 'en-US',
    ): Promise<InputPart> {
        const transcript = await this.transcribeAudio(
            file.buffer,
            file.fileName ?? 'audio.mp3',
            file.mimeType,
        );
        const text =
            localeTag === 'en-US'
                ? `Attached audio "${file.fileName ?? 'audio'}". Transcript:\n${transcript || '(empty)'}`
                : `Прикреплено аудио «${file.fileName ?? 'audio'}». Транскрипт:\n${transcript || '(пусто)'}`;
        return { type: 'input_text', text };
    }

    private buildDocumentPart(
        file: AiFileInput,
        localeTag: 'ru-RU' | 'en-US',
    ): InputPart {
        if (file.buffer.byteLength > MAX_DOCUMENT_BYTES) {
            throw new Error(
                localeTag === 'en-US'
                    ? 'The attached file is too large. Maximum is 20 MB.'
                    : 'Прикреплённый файл слишком большой. Максимум 20 МБ.',
            );
        }

        if (this.isBinaryDocument(file)) {
            const filename = file.fileName || this.fallbackDocumentName(file);
            const mime = file.mimeType || this.guessDocumentMime(filename);
            return {
                type: 'input_file',
                filename,
                file_data: `data:${mime};base64,${file.buffer.toString('base64')}`,
            };
        }

        const textContent = file.buffer.toString('utf-8').slice(0, 12000);
        return {
            type: 'input_text',
            text: `Содержимое файла ${file.fileName ?? 'document'}:\n${textContent}`,
        };
    }

    private async transcribeAudio(
        buffer: Buffer,
        fileName: string,
        mimeType?: string,
    ): Promise<string | undefined> {
        const client = this.requireClient();
        try {
            const file = await toFile(buffer, fileName, {
                type: mimeType || 'audio/mpeg',
            });
            const result = await client.audio.transcriptions.create({
                file,
                model: TRANSCRIBE_MODEL,
            });
            return 'text' in result ? result.text.trim() : undefined;
        } catch (error) {
            this.logger.warn(
                { err: this.extractRawError(error) },
                'OpenAI transcription failed',
            );
            try {
                const file = await toFile(buffer, fileName, {
                    type: mimeType || 'audio/mpeg',
                });
                const fallback = await client.audio.transcriptions.create({
                    file,
                    model: 'whisper-1',
                });
                return 'text' in fallback ? fallback.text.trim() : undefined;
            } catch (fallbackError) {
                this.logger.warn(
                    { err: this.extractRawError(fallbackError) },
                    'OpenAI whisper fallback failed',
                );
                return undefined;
            }
        }
    }

    private async generateImage(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const client = this.requireClient();
        const images =
            input.files?.filter((file) =>
                isImageMedia(file.mimeType, file.fileName),
            ) ?? [];
        const prompt = this.resolveImagePrompt(input.prompt, images.length > 0);

        if (!prompt) {
            throw new Error(
                'Отправьте текстовый промпт или фото для генерации изображения',
            );
        }

        const quality = this.normalizeQuality(input.quality);
        const size = this.mapAspectRatioToSize(input.aspectRatio);
        const model =
            getToolById(AiToolId.GPT_IMAGES)?.model ?? GPT_IMAGE_MODEL;

        try {
            const response =
                images.length > 0
                    ? await client.images.edit({
                          model,
                          prompt,
                          image: await Promise.all(
                              images.map((file, index) =>
                                  toFile(
                                      file.buffer,
                                      this.imageFileName(file, index),
                                      {
                                          type: file.mimeType || 'image/jpeg',
                                      },
                                  ),
                              ),
                          ),
                          quality,
                          size,
                      })
                    : await client.images.generate({
                          model,
                          prompt,
                          quality,
                          size,
                      });

            const b64 = response.data?.[0]?.b64_json;
            if (!b64) {
                throw new Error('Не удалось получить изображение от модели');
            }

            return {
                type: 'image',
                buffer: Buffer.from(b64, 'base64'),
                mimeType: 'image/png',
            };
        } catch (error) {
            this.logger.error(
                { err: this.extractRawError(error) },
                'OpenAI Images request failed',
            );
            throw new Error(this.formatError(error));
        }
    }

    private resolveImagePrompt(
        prompt: string | undefined,
        hasImages: boolean,
    ): string {
        const trimmed = prompt?.trim() ?? '';
        if (trimmed) {
            return trimmed;
        }
        if (!hasImages) {
            return '';
        }
        return 'Создай изображение по референсу';
    }

    private extractImages(response: {
        output?: Array<{
            type?: string;
            result?: string | null;
            content?: Array<{
                type?: string;
                image_url?: string;
                b64_json?: string;
            }>;
        }>;
    }): Array<{ buffer: Buffer; mimeType: string }> {
        const images: Array<{ buffer: Buffer; mimeType: string }> = [];

        for (const item of response.output ?? []) {
            if (item.type === 'image_generation_call' && item.result) {
                images.push({
                    buffer: Buffer.from(item.result, 'base64'),
                    mimeType: 'image/png',
                });
            }

            for (const part of item.content ?? []) {
                const dataUrl = part.image_url;
                if (part.type === 'output_image' && dataUrl) {
                    const parsed = this.parseDataUrl(dataUrl);
                    if (parsed) {
                        images.push(parsed);
                    }
                }
                if (part.b64_json) {
                    images.push({
                        buffer: Buffer.from(part.b64_json, 'base64'),
                        mimeType: 'image/png',
                    });
                }
            }
        }

        return images;
    }

    private parseDataUrl(
        url: string,
    ): { buffer: Buffer; mimeType: string } | undefined {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
            return undefined;
        }
        return {
            mimeType: match[1],
            buffer: Buffer.from(match[2], 'base64'),
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
                'You are GPT, powered by OpenAI models. If asked who you are or which model you are, say you are GPT. Do not claim to be Claude or created by Anthropic. ' +
                `Today is ${date}. ` +
                'If the question is about current events, prices, weather, news, or anything time-sensitive, use web search. ' +
                'Do not invent up-to-date facts. Answer in the same language as the user. ' +
                'When images, video frames, audio transcripts or documents are attached, analyze them (including people) and give concrete feedback — do not claim you cannot see or hear them. ' +
                'You can generate images when the user asks to draw, illustrate, edit or create a picture. ' +
                'Use Markdown formatting (bold, lists, code) when it improves readability.'
            );
        }

        return (
            'Ты — GPT на моделях OpenAI. Если спрашивают, кто ты или какая ты нейросеть — отвечай, что ты GPT. Не называй себя Claude и не говори, что тебя создала Anthropic. ' +
            `Сегодня ${date}. ` +
            'Если вопрос касается текущих событий, цен, погоды, новостей или другой актуальной информации — используй поиск в интернете. ' +
            'Не выдумывай актуальные факты. Отвечай на том же языке, что и пользователь. ' +
            'Если в сообщении есть изображения, кадры видео, транскрипт аудио или документы — анализируй их (в том числе людей) и давай конкретную обратную связь, а не отвечай, что не видишь вложения. ' +
            'Если пользователь просит нарисовать, проиллюстрировать или отредактировать картинку — сгенерируй изображение. ' +
            'Используй Markdown-форматирование (жирный текст, списки, код), когда это улучшает читаемость.'
        );
    }

    private normalizeQuality(quality?: string): GptImageQuality {
        if (quality && IMAGE_QUALITIES.includes(quality as GptImageQuality)) {
            return quality as GptImageQuality;
        }
        return 'auto';
    }

    private mapAspectRatioToSize(aspectRatio?: string): GptImageSize {
        if (!aspectRatio || aspectRatio === '1:1') {
            return '1024x1024';
        }
        if (PORTRAIT_ASPECT_RATIOS.has(aspectRatio)) {
            return '1024x1536';
        }
        const [width, height] = aspectRatio.split(':').map(Number);
        if (width && height) {
            if (width === height) {
                return '1024x1024';
            }
            return height > width ? '1024x1536' : '1536x1024';
        }
        return '1024x1024';
    }

    private imageFileName(file: AiFileInput, index: number): string {
        if (file.fileName && /\.(png|jpe?g|webp)$/i.test(file.fileName)) {
            return file.fileName;
        }
        const mime = file.mimeType.toLowerCase();
        const ext = mime.includes('png')
            ? 'png'
            : mime.includes('webp')
              ? 'webp'
              : 'jpg';
        return `ref-${index}.${ext}`;
    }

    private isBinaryDocument(file: AiFileInput): boolean {
        const mime = file.mimeType.toLowerCase();
        const name = (file.fileName ?? '').toLowerCase();
        if (
            mime.startsWith('text/') ||
            mime === 'application/json' ||
            mime === 'application/xml'
        ) {
            return false;
        }
        if (
            mime === 'application/pdf' ||
            mime.includes('officedocument') ||
            mime.includes('msword') ||
            mime.includes('ms-excel') ||
            mime.includes('ms-powerpoint')
        ) {
            return true;
        }
        return /\.(pdf|docx?|pptx?|xlsx?)$/i.test(name);
    }

    private fallbackDocumentName(file: AiFileInput): string {
        const mime = file.mimeType.toLowerCase();
        if (mime.includes('pdf')) return 'document.pdf';
        if (mime.includes('wordprocessingml') || mime.includes('msword')) {
            return 'document.docx';
        }
        if (mime.includes('presentationml') || mime.includes('powerpoint')) {
            return 'document.pptx';
        }
        if (mime.includes('spreadsheetml') || mime.includes('excel')) {
            return 'document.xlsx';
        }
        return 'document.bin';
    }

    private guessDocumentMime(filename: string): string {
        const name = filename.toLowerCase();
        if (name.endsWith('.pdf')) return 'application/pdf';
        if (name.endsWith('.docx')) {
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        if (name.endsWith('.pptx')) {
            return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        }
        if (name.endsWith('.xlsx')) {
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        }
        return 'application/octet-stream';
    }

    private ensureApiKey() {
        if (!this.apiKey || !this.client) {
            throw new Error('OPENAI_API_KEY is not configured');
        }
    }

    private requireClient(): OpenAI {
        this.ensureApiKey();
        return this.client!;
    }

    private formatError(error: unknown): string {
        const raw = this.extractRawError(error);
        if (/organization verification|verify.*organization/i.test(raw)) {
            return 'Для GPT Images нужна верификация организации в OpenAI.';
        }
        return raw;
    }

    private extractRawError(error: unknown): string {
        if (error instanceof APIError) {
            return error.message;
        }
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }

    private resolveSoraVideoMode(
        input: AiGenerationInput,
    ): 'create' | 'extend' | 'edit' {
        if (input.soraVideoMode === 'extend') {
            if (!input.sourceGenerationId?.trim()) {
                throw new Error(
                    'Сначала выберите готовое видео Sora и нажмите «Продлить видео»',
                );
            }
            return 'extend';
        }

        if (input.soraVideoMode === 'edit') {
            return 'edit';
        }

        const { videos } = splitMediaFiles(input.files);
        if (videos.length > 0 && input.prompt?.trim()) {
            return 'edit';
        }

        return 'create';
    }

    private async createSoraCreateJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const prompt = this.resolveSoraPrompt(input);
        const size = resolveSoraVideoSize(input.aspectRatio, input.resolution);
        const seconds = toSoraCreateSeconds(input.durationSeconds);
        const model = resolveSoraModel(input.quality, input.resolution);
        const characterIds = (input.soraCharacterIds ?? [])
            .map((id) => id.trim())
            .filter(Boolean)
            .slice(0, 2);

        const { images } = splitMediaFiles(input.files);
        if (images.length > 1) {
            throw new Error('Sora принимает только одно фото-референс');
        }

        if (characterIds.length > 0) {
            const video = await this.postSoraJson('/videos', {
                model,
                prompt,
                size,
                seconds,
                characters: characterIds.map((id) => ({ id })),
            });

            return this.toSoraJobResult(video);
        }

        const client = this.requireClient();
        const body: Record<string, unknown> = {
            model,
            prompt,
            size,
            seconds,
        };

        if (images[0]) {
            const resized = await resizeImageForSora(images[0].buffer, size);
            body.input_reference = await toFile(
                resized.buffer,
                resized.fileName,
                { type: resized.mimeType },
            );
        }

        const video = await client.videos.create(
            body as unknown as OpenAI.Videos.VideoCreateParams,
        );

        return this.toSoraJobResult(video);
    }

    private async createSoraExtendJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const prompt = input.prompt?.trim();
        if (!prompt) {
            throw new Error('Опишите, как продолжить видео Sora');
        }

        const seconds = toSoraExtendSeconds(input.durationSeconds);
        const sourceId = input.sourceGenerationId!.trim();

        const video = await this.postSoraJson('/videos/extensions', {
            video: { id: sourceId },
            prompt,
            seconds,
        });

        return this.toSoraJobResult(video);
    }

    private async createSoraEditJob(
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const prompt = input.prompt?.trim();
        if (!prompt) {
            throw new Error('Опишите, что изменить в видео Sora');
        }

        const { videos } = splitMediaFiles(input.files);
        const sourceId = input.sourceGenerationId?.trim();

        if (sourceId) {
            const video = await this.postSoraJson('/videos/edits', {
                video: { id: sourceId },
                prompt,
            });
            return this.toSoraJobResult(video);
        }

        if (!videos[0]) {
            throw new Error(
                'Для редактирования прикрепите видео и опишите, что изменить',
            );
        }

        const client = this.requireClient();
        const prepared = await transcodeVideoToH264(videos[0].buffer, {
            force: true,
        });
        const videoFile = await toFile(
            prepared,
            videos[0].fileName?.replace(/\.\w+$/i, '.mp4') ?? 'source.mp4',
            { type: 'video/mp4' },
        );

        const video = await client.videos.edit({
            prompt,
            video: videoFile,
        });

        return this.toSoraJobResult(video);
    }

    private resolveSoraPrompt(input: AiGenerationInput): string {
        const trimmed = input.prompt?.trim();
        const { images } = splitMediaFiles(input.files);

        if (trimmed) {
            return trimmed;
        }

        if (images.length) {
            return 'Создай плавное видео по прикреплённому кадру, сохранив стиль и композицию референса.';
        }

        throw new Error('Опишите сцену для генерации видео Sora');
    }

    private toSoraJobResult(video: { id?: string | null }): AiJobCreateResult {
        if (!video.id) {
            throw new Error('OpenAI Sora did not return video id');
        }

        return {
            providerJobId: video.id,
            estimatedTokenCost: 0,
        };
    }

    private mapSoraStatus(
        status: string,
    ): AiJobStatusResult['status'] {
        switch (status) {
            case 'completed':
                return 'completed';
            case 'failed':
                return 'failed';
            case 'in_progress':
                return 'processing';
            default:
                return 'pending';
        }
    }

    private async postSoraJson(
        path: string,
        body: Record<string, unknown>,
    ): Promise<{ id?: string | null }> {
        const response = await fetch(`https://api.openai.com/v1${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const payload = (await response.json()) as {
            id?: string;
            error?: { message?: string; code?: string };
        };

        if (!response.ok) {
            const message =
                payload.error?.message ??
                payload.error?.code ??
                `OpenAI Sora request failed (HTTP ${response.status})`;
            throw new Error(this.formatSoraErrorMessage(message));
        }

        return payload;
    }

    private formatSoraErrorMessage(message: string): string {
        if (/face|human likeness|people/i.test(message)) {
            return 'Sora отклонила референс с лицом человека. Используйте объект, персонажа без человеческого лица или только текст.';
        }

        if (/copyright|trademark|real person|public figure/i.test(message)) {
            return 'Sora отклонила запрос из-за ограничений контента. Измените промпт или референс.';
        }

        if (/moderation|content policy|blocked/i.test(message)) {
            return 'Sora заблокировала запрос по правилам модерации. Измените промпт или референс.';
        }

        return message;
    }
}
