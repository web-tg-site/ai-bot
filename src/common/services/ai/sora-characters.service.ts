import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import OpenAI, { APIError, toFile } from 'openai';
import { AiToolId } from './types';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import type { VideoToolSettings } from '@/common/types/video-tool-settings.type';
import { transcodeVideoForSoraCharacter } from '@/common/services/bot/utils/transcode-sora-character-video';

export type SoraCharacterRecord = VideoToolSettings['characters'] extends
    | (infer Item)[]
    | undefined
    ? Item
    : never;

const MAX_SORA_CHARACTERS = 20;
const MAX_SORA_CHARACTERS_PER_VIDEO = 2;

function extractOpenAiErrorMessage(error: unknown): string {
    if (error instanceof APIError) {
        const parts: string[] = [];
        if (error.message?.trim()) {
            parts.push(error.message.trim());
        }
        const body = error.error;
        if (body && typeof body === 'object') {
            const record = body as {
                message?: unknown;
                code?: unknown;
                type?: unknown;
            };
            if (typeof record.message === 'string' && record.message.trim()) {
                parts.push(record.message.trim());
            }
            if (typeof record.code === 'string' && record.code.trim()) {
                parts.push(record.code.trim());
            }
            if (typeof record.type === 'string' && record.type.trim()) {
                parts.push(record.type.trim());
            }
        }
        if (error.status) {
            parts.push(`HTTP ${error.status}`);
        }
        return parts.join(' | ');
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'Character create failed';
}

@Injectable()
export class SoraCharactersService {
    private readonly apiKey: string;
    private readonly client: OpenAI | null;

    constructor(
        configService: ConfigService,
        private readonly userAiToolSettingsModelService: UserAiToolSettingsModelService,
        @InjectPinoLogger(SoraCharactersService.name)
        private readonly logger: PinoLogger,
    ) {
        this.apiKey = configService.get<string>('OPENAI_API_KEY') ?? '';
        this.client = this.apiKey
            ? new OpenAI({
                  apiKey: this.apiKey,
                  timeout: 240_000,
                  maxRetries: 1,
              })
            : null;
    }

    async listCharacters(userId: string): Promise<SoraCharacterRecord[]> {
        const settings = await this.readSettings(userId);
        return settings.characters ?? [];
    }

    async createCharacter(params: {
        userId: string;
        name: string;
        videoBuffer: Buffer;
        mimeType: string;
        fileName?: string;
    }): Promise<SoraCharacterRecord> {
        this.ensureApiKey();
        const name = params.name.trim();
        if (!name) {
            throw new Error('Укажите имя персонажа');
        }

        const settings = await this.readSettings(params.userId);
        const existing = settings.characters ?? [];
        if (existing.length >= MAX_SORA_CHARACTERS) {
            throw new Error(
                `Можно сохранить не более ${MAX_SORA_CHARACTERS} персонажей Sora`,
            );
        }

        const client = this.requireClient();
        const prepared = await transcodeVideoForSoraCharacter(params.videoBuffer);
        const videoFile = await toFile(prepared, 'character.mp4', {
            type: 'video/mp4',
        });

        let response: { id?: string | null };
        try {
            response = await client.videos.createCharacter({
                name,
                video: videoFile,
            });
        } catch (error) {
            throw new Error(this.formatCreateError(error));
        }

        const characterId = response.id?.trim();
        if (!characterId) {
            throw new Error(
                'Не удалось создать персонажа Sora. Попробуйте другое видео.',
            );
        }

        const record: SoraCharacterRecord = {
            id: characterId,
            name,
            createdAt: new Date().toISOString(),
        };

        await this.writeSettings(params.userId, {
            characters: [record, ...existing],
        });

        return record;
    }

    async deleteCharacter(
        userId: string,
        characterId: string,
    ): Promise<void> {
        const settings = await this.readSettings(userId);
        const next = (settings.characters ?? []).filter(
            (item) => item.id !== characterId,
        );
        await this.writeSettings(userId, { characters: next });
    }

    validateSelectedCharacterIds(characterIds?: string[]): string[] {
        const unique = [...new Set((characterIds ?? []).map((id) => id.trim()))]
            .filter(Boolean)
            .slice(0, MAX_SORA_CHARACTERS_PER_VIDEO);

        return unique;
    }

    private async readSettings(userId: string) {
        return this.userAiToolSettingsModelService.getVideoSettings(
            userId,
            AiToolId.SORA,
        );
    }

    private async writeSettings(
        userId: string,
        patch: Pick<VideoToolSettings, 'characters'>,
    ): Promise<void> {
        await this.userAiToolSettingsModelService.upsertVideoSettings(
            userId,
            AiToolId.SORA,
            patch,
        );
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

    private formatCreateError(error: unknown): string {
        const raw = extractOpenAiErrorMessage(error);

        if (/[а-яА-ЯёЁ]/.test(raw) && !/status code|Request failed/i.test(raw)) {
            return raw.split('\n')[0].trim();
        }

        if (
            /human likeness|human-like|humanlike|depict.*human|looks like a person|real person|public figure|face detected|human face|people in/i.test(
                raw,
            )
        ) {
            return 'Sora не принимает персонажей, похожих на людей (даже ваших оригинальных). Нужно животное, игрушка, маскот или предмет без человеческого лица.';
        }

        if (
            /copyright|trademark|intellectual property|\bip\b|third[- ]party|franchis|licensed character|famous/i.test(
                raw,
            )
        ) {
            return 'Sora не принимает известных персонажей из фильмов и игр. Нужен свой оригинальный объект или маскот без чужого IP.';
        }

        if (/unsupported video format|accepted inputs|h\.?264|hevc|quicktime/i.test(raw)) {
            return 'Формат видео не подошёл. Загрузите клип 2–4 сек в MP4 или MOV (вертикальный или горизонтальный).';
        }

        if (/resolution|720|1080|aspect|dimension|width|height|too (small|large)/i.test(raw)) {
            return 'Клип не подходит по размеру. Нужно 2–4 сек, 720p, формат 16:9 или 9:16.';
        }

        if (/duration|seconds|too (long|short)|2.?4/i.test(raw)) {
            return 'Для персонажа нужно видео 2–4 секунды. Попробуйте чуть более длинный клип (около 3 сек).';
        }

        if (/moderation|content policy|blocked|safety|rejected|not allowed|violat/i.test(raw)) {
            return 'Sora отклонила клип по модерации. Подходят только животные, игрушки и объекты — без людей и без известных брендов.';
        }

        this.logger.warn({ err: raw }, 'Sora createCharacter failed');
        return 'Sora не приняла клип. Нужно 2–4 сек, 720p, вертикаль или горизонталь. Только животные, игрушки или объекты — без людей и без известных персонажей.';
    }
}
