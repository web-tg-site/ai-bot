import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    AiGenerationInput,
    AiGenerationResult,
    AiJobCreateResult,
    AiJobStatusResult,
} from '../types';
import { AiToolId } from '../types';

export const ELEVENLABS_DUBBING_RESULT_PREFIX = 'elevenlabs-dubbing://';

export function buildElevenLabsDubbingResultUrl(
    dubbingId: string,
    languageCode: string,
    contentType: string,
): string {
    return `${ELEVENLABS_DUBBING_RESULT_PREFIX}${dubbingId}/${languageCode}/${encodeURIComponent(contentType)}`;
}

export function isElevenLabsDubbingResultUrl(url?: string): boolean {
    return !!url?.startsWith(ELEVENLABS_DUBBING_RESULT_PREFIX);
}

const MAX_TEXT_LENGTH = 5000;
const DUBBING_JOB_SEPARATOR = '::';
const GEO_BLOCK_MESSAGE =
    'ElevenLabs API недоступен из вашего региона (HTTP 403). ' +
    'Для локальной разработки используйте VPN/прокси или запускайте бота на сервере за пределами ограниченных стран (например Railway).';

@Injectable()
export class ElevenLabsProvider {
    private readonly apiKey: string;
    private readonly voiceId: string;
    private readonly modelId: string;
    private readonly dubbingTargetLang: string;
    private readonly baseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(ElevenLabsProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('ELEVENLABS_API_KEY') ?? '';
        this.voiceId =
            configService.get<string>('ELEVENLABS_VOICE_ID') ??
            '21m00Tcm4TlvDq8ikWAM';
        this.modelId =
            configService.get<string>('ELEVENLABS_MODEL_ID') ??
            'eleven_multilingual_v2';
        this.dubbingTargetLang =
            configService.get<string>('ELEVENLABS_DUBBING_TARGET_LANG') ?? 'ru';
        const baseUrl =
            configService.get<string>('ELEVENLABS_BASE_URL') ??
            'https://api.elevenlabs.io/v1';
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async generate(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        this.ensureApiKey();

        switch (toolId) {
            case AiToolId.ELEVENLABS_VOICE:
                return this.textToSpeech(input);
            case AiToolId.VOICE_CLONE:
                return this.voiceClone(input);
            case AiToolId.SOUND_GENERATOR:
                return this.generateSoundEffect(input);
            default:
                throw new Error(
                    `ElevenLabs sync generate not supported for ${toolId}`,
                );
        }
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (toolId !== AiToolId.VIDEO_TO_AUDIO) {
            throw new Error(`ElevenLabs async job not supported for ${toolId}`);
        }

        const mediaFile = input.files?.find(
            (f) =>
                f.mimeType.startsWith('video/') ||
                f.mimeType.startsWith('audio/'),
        );

        if (!mediaFile) {
            throw new Error('Отправьте видео или аудиофайл для дубляжа');
        }

        const targetLang = this.resolveTargetLang(input.prompt);
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(mediaFile.buffer)], {
            type: mediaFile.mimeType,
        });
        formData.append('file', blob, mediaFile.fileName ?? 'media.mp4');
        formData.append('target_lang', targetLang);
        formData.append('source_lang', 'auto');
        formData.append('mode', 'automatic');

        const response = await this.post<{ dubbing_id: string }>(
            '/dubbing',
            formData,
            true,
        );

        return {
            providerJobId: `${response.dubbing_id}${DUBBING_JOB_SEPARATOR}${targetLang}`,
            estimatedTokenCost: 60,
        };
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        this.ensureApiKey();

        const [dubbingId, targetLang] = this.parseDubbingJobId(providerJobId);

        const response = await this.get<{
            status: string;
            target_languages?: string[];
            media_metadata?: { content_type?: string } | null;
            error?: string | null;
        }>(`/dubbing/${dubbingId}`);

        const status = this.mapStatus(response.status);

        if (status === 'failed') {
            return { status, errorMessage: response.error ?? 'Dubbing failed' };
        }

        if (status === 'completed') {
            const lang =
                targetLang ||
                response.target_languages?.[0] ||
                this.dubbingTargetLang;
            const contentType =
                response.media_metadata?.content_type ?? 'audio/mpeg';
            const isVideo = contentType.startsWith('video/');

            return {
                status,
                result: {
                    type: isVideo ? 'video' : 'audio',
                    url: buildElevenLabsDubbingResultUrl(
                        dubbingId,
                        lang,
                        contentType,
                    ),
                    mimeType: contentType,
                },
            };
        }

        return { status };
    }

    async downloadDubbingResult(
        providerJobId: string,
        result: AiGenerationResult,
    ): Promise<AiGenerationResult> {
        const [dubbingId, targetLang] = this.parseDubbingJobId(providerJobId);
        const lang = targetLang || this.dubbingTargetLang;
        const buffer = await this.downloadDubbedMedia(dubbingId, lang);

        return {
            type: result.type,
            buffer,
            mimeType: result.mimeType,
        };
    }

    private async textToSpeech(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const text = (input.prompt ?? '').slice(0, MAX_TEXT_LENGTH);

        if (!text.trim()) {
            throw new Error('Отправьте текст для озвучки');
        }

        const buffer = await this.postBinary(
            `/text-to-speech/${this.voiceId}`,
            {
                text,
                model_id: this.modelId,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'audio/mpeg',
                },
                timeout: 120000,
            },
        );

        return {
            type: 'audio',
            buffer,
            mimeType: 'audio/mpeg',
        };
    }

    private async voiceClone(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const voiceSample = input.files?.find(
            (f) =>
                f.mimeType.startsWith('audio/') ||
                f.mimeType.startsWith('video/'),
        );

        if (!voiceSample) {
            throw new Error(
                'Отправьте голосовое сообщение или аудиофайл как образец голоса',
            );
        }

        if (!input.prompt) {
            throw new Error(
                'Отправьте текст для озвучки клонированным голосом',
            );
        }

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(voiceSample.buffer)], {
            type: voiceSample.mimeType,
        });
        formData.append('files', blob, voiceSample.fileName ?? 'sample.mp3');
        formData.append('name', `clone_${Date.now()}`);

        let voiceId: string;
        try {
            const cloneResponse = await firstValueFrom(
                this.httpService.post<{ voice_id: string }>(
                    `${this.baseUrl}/voices/add`,
                    formData,
                    {
                        headers: { 'xi-api-key': this.apiKey },
                        timeout: 120000,
                    },
                ),
            );
            voiceId = cloneResponse.data.voice_id;
        } catch (error) {
            this.logger.error(
                `ElevenLabs voice clone failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }

        try {
            const buffer = await this.postBinary(
                `/text-to-speech/${voiceId}`,
                {
                    text: input.prompt.slice(0, MAX_TEXT_LENGTH),
                    model_id: this.modelId,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'audio/mpeg',
                    },
                    timeout: 120000,
                },
            );

            return {
                type: 'audio',
                buffer,
                mimeType: 'audio/mpeg',
            };
        } finally {
            await this.deleteVoice(voiceId);
        }
    }

    private async generateSoundEffect(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        if (!input.prompt?.trim()) {
            throw new Error('Опишите звук, который нужно сгенерировать');
        }

        const durationSeconds = Math.min(
            22,
            Math.max(0.5, input.durationSeconds ?? 5),
        );

        const buffer = await this.postBinary(
            '/sound-generation',
            {
                text: input.prompt.trim().slice(0, 500),
                duration_seconds: durationSeconds,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'audio/mpeg',
                },
                timeout: 60000,
            },
        );

        return {
            type: 'audio',
            buffer,
            mimeType: 'audio/mpeg',
        };
    }

    private async downloadDubbedMedia(
        dubbingId: string,
        languageCode: string,
    ): Promise<Buffer> {
        return this.getBinary(
            `/dubbing/${dubbingId}/audio/${languageCode}`,
            300000,
        );
    }

    private async postBinary(
        path: string,
        body: unknown,
        config: AxiosRequestConfig = {},
    ): Promise<Buffer> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<ArrayBuffer>(
                    `${this.baseUrl}${path}`,
                    body,
                    {
                        ...config,
                        headers: {
                            'xi-api-key': this.apiKey,
                            ...config.headers,
                        },
                        responseType: 'arraybuffer',
                    },
                ),
            );
            return Buffer.from(response.data);
        } catch (error) {
            this.logger.error(
                `ElevenLabs POST ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private async getBinary(path: string, timeout = 30000): Promise<Buffer> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<ArrayBuffer>(`${this.baseUrl}${path}`, {
                    headers: { 'xi-api-key': this.apiKey },
                    responseType: 'arraybuffer',
                    timeout,
                }),
            );
            return Buffer.from(response.data);
        } catch (error) {
            this.logger.error(
                `ElevenLabs GET ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private async deleteVoice(voiceId: string) {
        try {
            await firstValueFrom(
                this.httpService.delete(`${this.baseUrl}/voices/${voiceId}`, {
                    headers: { 'xi-api-key': this.apiKey },
                    timeout: 30000,
                }),
            );
        } catch (error) {
            this.logger.warn(
                `Failed to delete cloned voice ${voiceId}: ${this.formatError(error)}`,
            );
        }
    }

    private resolveTargetLang(prompt?: string): string {
        const trimmed = prompt?.trim().toLowerCase();
        if (trimmed && /^[a-z]{2,3}$/.test(trimmed)) {
            return trimmed;
        }
        return this.dubbingTargetLang;
    }

    private parseDubbingJobId(providerJobId: string): [string, string] {
        const separatorIndex = providerJobId.indexOf(DUBBING_JOB_SEPARATOR);
        if (separatorIndex === -1) {
            return [providerJobId, this.dubbingTargetLang];
        }

        return [
            providerJobId.slice(0, separatorIndex),
            providerJobId.slice(separatorIndex + DUBBING_JOB_SEPARATOR.length),
        ];
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error(
                'ELEVENLABS_API_KEY не настроен. Добавьте ключ в .env (получить на elevenlabs.io → Profile → API Key).',
            );
        }
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (['dubbed', 'completed', 'success'].includes(normalized))
            return 'completed';
        if (['failed', 'error'].includes(normalized)) return 'failed';
        if (['dubbing', 'processing'].includes(normalized)) return 'processing';
        return 'pending';
    }

    private async post<T>(
        path: string,
        data: unknown,
        isForm = false,
    ): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, data, {
                    headers: isForm
                        ? { 'xi-api-key': this.apiKey }
                        : {
                              'xi-api-key': this.apiKey,
                              'Content-Type': 'application/json',
                          },
                    timeout: 120000,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `ElevenLabs POST ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private async get<T>(path: string): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<T>(`${this.baseUrl}${path}`, {
                    headers: { 'xi-api-key': this.apiKey },
                    timeout: 30000,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `ElevenLabs GET ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private decodeResponseBody(data: unknown): string {
        if (!data) {
            return '';
        }
        if (typeof data === 'string') {
            return data;
        }
        if (data instanceof ArrayBuffer) {
            return Buffer.from(data).toString('utf8');
        }
        if (Buffer.isBuffer(data)) {
            return data.toString('utf8');
        }
        if (typeof data === 'object') {
            return this.extractApiMessage(data) ?? JSON.stringify(data);
        }
        if (
            typeof data === 'number' ||
            typeof data === 'boolean' ||
            typeof data === 'bigint'
        ) {
            return String(data);
        }
        return 'ElevenLabs API error';
    }

    private extractApiMessage(data: object): string | undefined {
        if (!('detail' in data)) {
            if ('message' in data && typeof data.message === 'string') {
                return data.message;
            }
            return undefined;
        }

        const detail = data.detail;
        if (typeof detail === 'string') {
            return detail;
        }
        if (Array.isArray(detail)) {
            const messages = detail
                .map((item) => {
                    if (typeof item === 'string') {
                        return item;
                    }
                    if (item && typeof item === 'object' && 'msg' in item) {
                        const msg = (item as { msg?: unknown }).msg;
                        return typeof msg === 'string' ? msg : undefined;
                    }
                    return undefined;
                })
                .filter(Boolean);
            if (messages.length) {
                return messages.join('; ');
            }
        }
        if (detail && typeof detail === 'object') {
            if ('message' in detail && typeof detail.message === 'string') {
                return detail.message;
            }
            if ('status' in detail && typeof detail.status === 'string') {
                return detail.status;
            }
        }
        return undefined;
    }

    private isGeoBlocked(status: number | undefined, body: string): boolean {
        if (status !== 403) {
            return false;
        }
        return (
            body.includes('Just a moment') ||
            body.includes('cloudflare') ||
            body.includes('challenge-platform')
        );
    }

    private formatError(error: unknown): string {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as {
                response?: { status?: number; data?: unknown };
            };
            const status = axiosError.response?.status;
            const body = this.decodeResponseBody(axiosError.response?.data);

            if (this.isGeoBlocked(status, body)) {
                return GEO_BLOCK_MESSAGE;
            }

            const apiMessage = body
                ? (this.extractApiMessage(
                      typeof axiosError.response?.data === 'object' &&
                          axiosError.response.data !== null &&
                          !(axiosError.response.data instanceof ArrayBuffer) &&
                          !Buffer.isBuffer(axiosError.response.data)
                          ? axiosError.response.data
                          : (this.tryParseJson(body) ?? {}),
                  ) ?? (body.length <= 300 ? body : body.slice(0, 300)))
                : undefined;

            if (apiMessage) {
                return apiMessage;
            }

            if (status === 401) {
                return 'Неверный ELEVENLABS_API_KEY. Проверьте ключ в .env.';
            }
            if (status === 402) {
                return 'Недостаточно кредитов ElevenLabs. Пополните баланс на elevenlabs.io.';
            }
            if (status === 403) {
                return 'Доступ к ElevenLabs запрещён (HTTP 403). Проверьте подписку, голос и модель.';
            }
            if (status) {
                return `ElevenLabs API error: HTTP ${status}`;
            }
        }

        return error instanceof Error ? error.message : 'ElevenLabs API error';
    }

    private tryParseJson(body: string): object | undefined {
        try {
            const parsed: unknown = JSON.parse(body);
            return typeof parsed === 'object' && parsed !== null
                ? parsed
                : undefined;
        } catch {
            return undefined;
        }
    }
}
