import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AiGenerationInput, AiGenerationResult } from '../types';

@Injectable()
export class BytePlusProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly seedreamModel: string;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(BytePlusProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('BYTEPLUS_API_KEY') ?? '';
        this.baseUrl =
            configService.get<string>('BYTEPLUS_ENDPOINT') ??
            'https://ark.ap-southeast.bytepluses.com/api/v3';
        this.seedreamModel =
            configService.get<string>('BYTEPLUS_SEEDREAM_MODEL') ??
            'seedream-5-0-lite-260128';
    }

    async generateImage(
        input: AiGenerationInput,
        model?: string,
    ): Promise<AiGenerationResult> {
        this.ensureApiKey();

        const response = await this.post<{
            data: Array<{ url?: string; b64_json?: string }>;
        }>('/images/generations', {
            model: model ?? this.seedreamModel,
            prompt: input.prompt,
            size: '2K',
            response_format: 'url',
        });

        const item = response.data?.[0];
        if (item?.url) {
            return { type: 'image', url: item.url };
        }
        if (item?.b64_json) {
            return {
                type: 'image',
                buffer: Buffer.from(item.b64_json, 'base64'),
                mimeType: 'image/png',
            };
        }

        throw new Error('BytePlus did not return an image');
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('BYTEPLUS_API_KEY is not configured');
        }
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, data, {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 120000,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `BytePlus POST ${path} failed: ${this.formatError(error)}`,
            );
            throw new Error(this.formatError(error));
        }
    }

    private formatError(error: unknown): string {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as {
                response?: { data?: { error?: { message?: string } } };
            };
            return (
                axiosError.response?.data?.error?.message ??
                'BytePlus API error'
            );
        }
        return error instanceof Error ? error.message : 'BytePlus API error';
    }
}
