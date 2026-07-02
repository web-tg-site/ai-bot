import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { getToolById } from '@/common/config/ai-tools.registry';
import {
    AiGenerationInput,
    AiGenerationResult,
    AiJobCreateResult,
    AiJobStatusResult,
} from '../types';
import { AiToolId } from '../types';

export function isSharpiiMidjourneyUpstreamError(message: string): boolean {
    return /Image generation failed|Insufficient corporate funds|Midjourney через Sharpii временно недоступен|provider_error|provider unavailable|provider_timeout/i.test(
        message,
    );
}

type SharpiiTaskSubmitResponse = {
    data?: {
        task?: {
            id: string;
            status: string;
        };
        outputs?: Array<{ type: string; url: string }>;
    };
};

type SharpiiTaskStatusResponse = {
    data?: {
        id: string;
        status: string;
        outputs?: Array<{ type: string; url: string }>;
        error?: { message?: string; code?: string };
    };
};

@Injectable()
export class SharpiiProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly ttsVoice: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(SharpiiProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('SHARPII_API_KEY') ?? '';
        this.baseUrl =
            configService.get<string>('SHARPII_API_URL') ??
            'https://api.sharpii.ai';
        this.ttsVoice =
            configService.get<string>('SHARPII_TTS_VOICE') ?? 'alloy';
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

        if (tool.category === 'audio') {
            if (toolId === AiToolId.VIDEO_TO_AUDIO) {
                return this.createLipsyncJob(input, tool.model);
            }

            return this.createAudioJob(toolId, tool.model, input);
        }

        const isVideo = tool.category === 'video';
        const path = isVideo ? '/v1/videos/generate' : '/v1/images/generate';
        const body = this.buildVideoImageRequestBody(
            toolId,
            tool.model,
            input,
            isVideo,
        );

        const response = await this.post<SharpiiTaskSubmitResponse>(path, body);
        const taskId = response.data?.task?.id;

        if (!taskId) {
            throw new Error('Sharpii did not return task id');
        }

        return {
            providerJobId: taskId,
            estimatedTokenCost: 0,
        };
    }

    async getJobStatus(
        providerJobId: string,
        toolId: AiToolId,
    ): Promise<AiJobStatusResult> {
        this.ensureApiKey();

        const response = await this.get<SharpiiTaskStatusResponse>(
            `/v1/tasks/${providerJobId}`,
        );
        const task = response.data;

        if (!task) {
            throw new Error('Sharpii task not found');
        }

        const status = this.mapStatus(task.status);
        const output = task.outputs?.[0];

        if (status === 'completed' && output?.url) {
            return {
                status,
                result: {
                    type: this.resolveResultType(toolId, output.type),
                    url: output.url,
                    mimeType:
                        this.resolveResultType(toolId, output.type) === 'audio'
                            ? 'audio/mpeg'
                            : undefined,
                },
            };
        }

        if (status === 'failed') {
            const rawMessage =
                task.error?.message ??
                task.error?.code ??
                'Sharpii generation failed';
            return {
                status,
                errorMessage: this.formatSharpiiApiMessage(
                    rawMessage,
                    task.error?.code,
                ),
            };
        }

        return { status };
    }

    async generate(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        this.ensureApiKey();

        const tool = getToolById(toolId);
        if (!tool?.model) {
            throw new Error(`Model not configured for ${toolId}`);
        }

        if (tool.category === 'audio' && !tool.isAsync) {
            if (toolId === AiToolId.VOICE_CLONE) {
                return this.generateVoiceClone(input, tool.model);
            }
        }

        const job = await this.createJob(toolId, input);
        return this.pollTaskUntilResult(job.providerJobId, toolId);
    }

    private async generateSpeech(
        input: AiGenerationInput,
        model: string,
    ): Promise<AiGenerationResult> {
        const response = await this.post<SharpiiTaskSubmitResponse>(
            '/v1/audio/speech',
            {
                model,
                voice: this.ttsVoice,
                text: (input.prompt ?? '').slice(0, 5000),
                format: 'mp3',
            },
        );

        const inline = this.extractInlineOutput(
            response,
            AiToolId.ELEVENLABS_VOICE,
        );
        if (inline) {
            return inline;
        }

        const taskId = response.data?.task?.id;
        if (!taskId) {
            throw new Error('Sharpii speech did not return result');
        }

        return this.pollTaskUntilResult(taskId, AiToolId.ELEVENLABS_VOICE);
    }

    private async generateVoiceClone(
        input: AiGenerationInput,
        model: string,
    ): Promise<AiGenerationResult> {
        const sample = this.findVoiceSample(input);
        if (!sample) {
            throw new Error(
                'Отправьте голосовое сообщение или аудиофайл как образец голоса',
            );
        }

        if (!input.prompt) {
            throw new Error(
                'Отправьте текст для озвучки клонированным голосом',
            );
        }

        const response = await this.post<SharpiiTaskSubmitResponse>(
            '/v1/audio/voice-clone',
            {
                model,
                text: input.prompt.slice(0, 5000),
                audio_url: this.toDataUrl(sample),
                custom_voice_id:
                    input.customVoiceId ?? `bot-clone-${randomUUID()}`,
                need_noise_reduction: true,
                need_volume_normalization: true,
                speech_speed: 1.0,
            },
        );

        const inline = this.extractInlineOutput(response, AiToolId.VOICE_CLONE);
        if (inline) {
            return inline;
        }

        const taskId = response.data?.task?.id;
        if (!taskId) {
            throw new Error('Sharpii voice clone did not return result');
        }

        return this.pollTaskUntilResult(taskId, AiToolId.VOICE_CLONE);
    }

    private async createAudioJob(
        toolId: AiToolId,
        model: string,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        const path = '/v1/audio/speech';
        const body = {
            model,
            voice: this.ttsVoice,
            text: (input.prompt ?? '').slice(0, 5000),
            format: 'mp3',
        };

        const response = await this.post<SharpiiTaskSubmitResponse>(path, body);
        const taskId = response.data?.task?.id;

        if (!taskId) {
            throw new Error('Sharpii did not return audio task id');
        }

        return {
            providerJobId: taskId,
            estimatedTokenCost: 0,
        };
    }

    private async createLipsyncJob(
        input: AiGenerationInput,
        model: string,
    ): Promise<AiJobCreateResult> {
        const image = input.files?.find((file) =>
            file.mimeType.startsWith('image/'),
        );
        const audio = this.findVoiceSample(input);

        if (image && audio) {
            const response = await this.post<SharpiiTaskSubmitResponse>(
                '/v1/videos/lipsync',
                {
                    model,
                    image_url: this.toDataUrl(image),
                    audio_url: this.toDataUrl(audio),
                },
            );

            const taskId = response.data?.task?.id;
            if (!taskId) {
                throw new Error('Sharpii did not return lipsync task id');
            }

            return { providerJobId: taskId, estimatedTokenCost: 0 };
        }

        if (!image) {
            throw new Error(
                'Отправьте фото (портрет) для генерации говорящего видео',
            );
        }

        if (!input.prompt?.trim()) {
            throw new Error(
                'Отправьте текст сценария в подписи к фото или отдельным сообщением',
            );
        }

        throw new Error('Не удалось подготовить аудиодорожку для lipsync');
    }

    private async pollTaskUntilResult(
        providerJobId: string,
        toolId: AiToolId,
    ): Promise<AiGenerationResult> {
        const maxAttempts = 90;

        for (let i = 0; i < maxAttempts; i++) {
            await this.sleep(i < 10 ? 3000 : 10000);
            const status = await this.getJobStatus(providerJobId, toolId);

            if (status.status === 'completed' && status.result) {
                return status.result;
            }
            if (status.status === 'failed') {
                throw new Error(
                    status.errorMessage ?? 'Sharpii generation failed',
                );
            }
        }

        throw new Error('Sharpii generation timed out');
    }

    private extractInlineOutput(
        response: SharpiiTaskSubmitResponse,
        toolId: AiToolId,
    ): AiGenerationResult | null {
        const output = response.data?.outputs?.[0];
        if (!output?.url) {
            return null;
        }

        const type = this.resolveResultType(toolId, output.type);
        return {
            type,
            url: output.url,
            mimeType: type === 'audio' ? 'audio/mpeg' : undefined,
        };
    }

    private resolveResultType(
        toolId: AiToolId,
        outputType?: string,
    ): AiGenerationResult['type'] {
        if (
            [AiToolId.ELEVENLABS_VOICE, AiToolId.VOICE_CLONE].includes(toolId)
        ) {
            return 'audio';
        }

        if (
            [
                AiToolId.SORA,
                AiToolId.SEEDANCE,
                AiToolId.VIDEO_TO_AUDIO,
            ].includes(toolId) ||
            outputType === 'video'
        ) {
            return 'video';
        }

        return 'image';
    }

    private buildVideoImageRequestBody(
        toolId: AiToolId,
        model: string,
        input: AiGenerationInput,
        isVideo: boolean,
    ): Record<string, unknown> {
        const body: Record<string, unknown> = {
            model,
            prompt: input.prompt ?? '',
        };

        if (isVideo) {
            body.duration = this.resolveVideoDuration(
                toolId,
                input.durationSeconds ?? 5,
            );
            body.aspect_ratio = '16:9';

            const firstFrameUrl = this.resolveFirstFrameUrl(input);
            if (firstFrameUrl) {
                body.first_frame_url = firstFrameUrl;
            }

            if (toolId === AiToolId.SEEDANCE) {
                body.audio_sync = false;
            }
        } else {
            body.aspect_ratio = '1:1';
        }

        return body;
    }

    private resolveVideoDuration(
        toolId: AiToolId,
        durationSeconds: number,
    ): number {
        if (toolId === AiToolId.SORA) {
            return durationSeconds <= 10 ? 10 : 15;
        }

        if (toolId === AiToolId.SEEDANCE) {
            return Math.min(15, Math.max(4, durationSeconds));
        }

        return durationSeconds;
    }

    private resolveFirstFrameUrl(input: AiGenerationInput): string | undefined {
        const image = input.files?.find((file) =>
            file.mimeType.startsWith('image/'),
        );
        if (!image) {
            return undefined;
        }

        return this.toDataUrl(image);
    }

    private findVoiceSample(input: AiGenerationInput) {
        return input.files?.find(
            (file) =>
                file.mimeType.startsWith('audio/') ||
                file.mimeType.startsWith('video/') ||
                file.mimeType === 'audio/ogg',
        );
    }

    private toDataUrl(
        file: NonNullable<AiGenerationInput['files']>[number],
    ): string {
        return `data:${file.mimeType};base64,${file.buffer.toString('base64')}`;
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('SHARPII_API_KEY is not configured');
        }
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (['completed', 'success', 'done'].includes(normalized))
            return 'completed';
        if (['failed', 'error'].includes(normalized)) return 'failed';
        if (['processing', 'running'].includes(normalized)) return 'processing';
        if (['queued', 'pending'].includes(normalized)) return 'pending';
        return 'pending';
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, data, {
                    headers: this.getHeaders(),
                    timeout: 120000,
                    validateStatus: (status) => status >= 200 && status < 300,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `Sharpii POST ${path} failed: ${this.formatError(error)}`,
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
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `Sharpii GET ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private getHeaders() {
        return {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };
    }

    private formatError(error: unknown): string {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as {
                response?: {
                    status?: number;
                    data?: {
                        message?: string;
                        error?: { message?: string; code?: string };
                        meta?: { request_id?: string };
                    };
                };
            };

            const data = axiosError.response?.data;
            const code = data?.error?.code;
            const message = data?.error?.message ?? data?.message;
            const requestId = data?.meta?.request_id;

            if (message) {
                return this.formatSharpiiApiMessage(message, code, requestId);
            }

            if (axiosError.response?.status) {
                return `Sharpii API error: HTTP ${axiosError.response.status}`;
            }
        }

        return error instanceof Error ? error.message : 'Sharpii API error';
    }

    private formatSharpiiApiMessage(
        message: string,
        code?: string,
        requestId?: string,
    ): string {
        const suffix = requestId ? `\n\nID запроса: ${requestId}` : '';

        if (
            code === 'provider_error' &&
            message.includes('Insufficient corporate funds')
        ) {
            return `Sharpii: у провайдера закончился баланс (это не ваши кредиты на sharpii.ai). Попробуйте Seedance, Flux или другой инструмент.${suffix}`;
        }

        if (
            code === 'provider_error' &&
            message === 'Image generation failed'
        ) {
            return `Midjourney через Sharpii временно недоступен (сбой на стороне провайдера, не ваших кредитов).${suffix}`;
        }

        if (
            /Insufficient credits.*permanent:|Pre-deduction failed.*insufficient quota/i.test(
                message,
            )
        ) {
            const availableMatch = message.match(/available ([\d.]+) credits/);
            const needMatch = message.match(/need ([\d.]+) credits/);
            const available = availableMatch?.[1] ?? '?';
            const need = needMatch?.[1] ?? '?';

            return (
                `Suno (генерация звуков) на Sharpii списывает отдельный пул permanent-кредитов, ` +
                `а не основной баланс подписки (~172k на вашем аккаунте). ` +
                `Для Suno сейчас доступно ${available} кредитов, нужно минимум ${need}.\n\n` +
                `Это ограничение Sharpii/Suno. Используйте Seedance, Flux, ElevenLabs Voice или обратитесь в поддержку sharpii.ai.${suffix}`
            );
        }

        if (message.includes('Insufficient credits')) {
            return `Недостаточно кредитов Sharpii для этой генерации. Пополните баланс на sharpii.ai.${suffix}`;
        }

        if (requestId) {
            return `${message}${suffix}`;
        }

        return message;
    }

    private sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
