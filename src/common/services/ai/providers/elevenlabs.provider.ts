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
import { AiToolId } from '../types';

@Injectable()
export class ElevenLabsProvider {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://api.elevenlabs.io/v1';

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(ElevenLabsProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('ELEVENLABS_API_KEY') ?? '';
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
        if (toolId !== AiToolId.VIDEO_TO_AUDIO) {
            throw new Error(`ElevenLabs async job not supported for ${toolId}`);
        }

        const response = await this.post<{ dubbing_id: string }>(
            '/dubbing',
            {
                source_url: input.files?.find((f) =>
                    f.mimeType.startsWith('video/'),
                )
                    ? undefined
                    : undefined,
                target_lang: 'ru',
                mode: 'manual',
            },
            true,
        );

        return {
            providerJobId: response.dubbing_id,
            estimatedTokenCost: 60,
        };
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        const response = await this.get<{
            status: string;
            target_url?: string;
            error?: string;
        }>(`/dubbing/${providerJobId}`);

        const status = this.mapStatus(response.status);

        if (status === 'completed' && response.target_url) {
            return {
                status,
                result: {
                    type: 'audio',
                    url: response.target_url,
                    mimeType: 'audio/mpeg',
                },
            };
        }

        if (status === 'failed') {
            return { status, errorMessage: response.error ?? 'Dubbing failed' };
        }

        return { status };
    }

    private async textToSpeech(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const text = (input.prompt ?? '').slice(0, 500);
        const voiceId = '21m00Tcm4TlvDq8ikWAM';

        const response = await firstValueFrom(
            this.httpService.post<ArrayBuffer>(
                `${this.baseUrl}/text-to-speech/${voiceId}`,
                {
                    text,
                    model_id: 'eleven_multilingual_v2',
                },
                {
                    headers: {
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                        Accept: 'audio/mpeg',
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000,
                },
            ),
        );

        return {
            type: 'audio',
            buffer: Buffer.from(response.data),
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

        const cloneResponse = await firstValueFrom(
            this.httpService.post<{ voice_id: string }>(
                `${this.baseUrl}/voices/add`,
                formData,
                {
                    headers: { 'xi-api-key': this.apiKey },
                    timeout: 60000,
                },
            ),
        );

        const voiceId = cloneResponse.data.voice_id;
        const ttsResponse = await firstValueFrom(
            this.httpService.post<ArrayBuffer>(
                `${this.baseUrl}/text-to-speech/${voiceId}`,
                {
                    text: input.prompt.slice(0, 500),
                    model_id: 'eleven_multilingual_v2',
                },
                {
                    headers: {
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                        Accept: 'audio/mpeg',
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000,
                },
            ),
        );

        return {
            type: 'audio',
            buffer: Buffer.from(ttsResponse.data),
            mimeType: 'audio/mpeg',
        };
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

        const response = await firstValueFrom(
            this.httpService.post<ArrayBuffer>(
                `${this.baseUrl}/sound-generation`,
                {
                    text: input.prompt.trim().slice(0, 500),
                    duration_seconds: durationSeconds,
                },
                {
                    headers: {
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                        Accept: 'audio/mpeg',
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000,
                },
            ),
        );

        return {
            type: 'audio',
            buffer: Buffer.from(response.data),
            mimeType: 'audio/mpeg',
        };
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
                    timeout: 60000,
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

    private formatError(error: unknown): string {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as {
                response?: { data?: { detail?: { message?: string } } };
            };
            return (
                axiosError.response?.data?.detail?.message ??
                'ElevenLabs API error'
            );
        }
        return error instanceof Error ? error.message : 'ElevenLabs API error';
    }
}
