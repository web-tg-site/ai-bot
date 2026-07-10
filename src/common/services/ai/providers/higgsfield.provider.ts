import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
    AiGenerationInput,
    AiJobCreateResult,
    AiJobStatusResult,
} from '../types';

@Injectable()
export class HiggsfieldProvider {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://cloud.higgsfield.ai/api/v1';

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        @InjectPinoLogger(HiggsfieldProvider.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('HIGGSFIELD_API_KEY') ?? '';
    }

    async createJob(input: AiGenerationInput): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        const response = await this.post<{ id: string }>('/generations/video', {
            prompt: input.prompt,
            duration: input.durationSeconds ?? 5,
            resolution: input.resolution ?? '720p',
            image: input.files?.[0]
                ? `data:${input.files[0].mimeType};base64,${input.files[0].buffer.toString('base64')}`
                : undefined,
        });

        return {
            providerJobId: response.id,
            estimatedTokenCost: 0,
        };
    }

    async getJobStatus(providerJobId: string): Promise<AiJobStatusResult> {
        const response = await this.get<{
            status: string;
            output_url?: string;
            error?: string;
        }>(`/generations/${providerJobId}`);

        const status = this.mapStatus(response.status);

        if (status === 'completed' && response.output_url) {
            return {
                status,
                result: { type: 'video', url: response.output_url },
            };
        }

        if (status === 'failed') {
            return {
                status,
                errorMessage: response.error ?? 'Higgsfield generation failed',
            };
        }

        return { status };
    }

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('HIGGSFIELD_API_KEY is not configured');
        }
    }

    private mapStatus(status: string): AiJobStatusResult['status'] {
        const normalized = status.toLowerCase();
        if (['completed', 'success', 'done'].includes(normalized))
            return 'completed';
        if (['failed', 'error'].includes(normalized)) return 'failed';
        if (['processing', 'running'].includes(normalized)) return 'processing';
        return 'pending';
    }

    private async post<T>(path: string, data: unknown): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.httpService.post<T>(`${this.baseUrl}${path}`, data, {
                    headers: this.getHeaders(),
                    timeout: 60000,
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `Higgsfield POST ${path} failed: ${this.formatError(error)}`,
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
                `Higgsfield GET ${path} failed: ${this.formatError(error)}`,
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
                response?: { data?: { message?: string } };
            };
            return axiosError.response?.data?.message ?? 'Higgsfield API error';
        }
        return error instanceof Error ? error.message : 'Higgsfield API error';
    }
}
