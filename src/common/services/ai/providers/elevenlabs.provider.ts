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
import { OpenRouterProvider } from './openrouter.provider';
import {
    ELEVENLABS_VOICE_CATALOG,
    ElevenLabsVoiceOption,
    mapElevenLabsGender,
    mapElevenLabsUseCase,
    resolveElevenLabsVoiceLabels,
} from '@/common/config/elevenlabs-voices.config';

export type { ElevenLabsVoiceOption };

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
    'Сервис озвучки недоступен из вашего региона. Попробуйте позже или выберите другой инструмент.';

@Injectable()
export class ElevenLabsProvider {
    private readonly apiKey: string;
    private readonly voiceId: string;
    private readonly modelId: string;
    private readonly ttsLanguageCode: string;
    private readonly dubbingTargetLang: string;
    private readonly sfxModelId: string;
    private readonly sfxPromptInfluence: number;
    private readonly sfxDurationSeconds: number;
    private readonly baseUrl: string;
    private voicesCache: {
        fetchedAt: number;
        voices: ElevenLabsVoiceOption[];
    } | null = null;
    private readonly voicesCacheTtlMs = 30 * 60 * 1000;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        private readonly openRouterProvider: OpenRouterProvider,
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
        this.ttsLanguageCode =
            configService.get<string>('ELEVENLABS_TTS_LANGUAGE_CODE') ?? 'ru';
        this.dubbingTargetLang =
            configService.get<string>('ELEVENLABS_DUBBING_TARGET_LANG') ?? 'ru';
        this.sfxModelId =
            configService.get<string>('ELEVENLABS_SFX_MODEL_ID') ??
            'eleven_text_to_sound_v2';
        this.sfxPromptInfluence = Math.min(
            1,
            Math.max(
                0,
                Number(
                    configService.get<string>(
                        'ELEVENLABS_SFX_PROMPT_INFLUENCE',
                    ) ?? '0.75',
                ),
            ),
        );
        this.sfxDurationSeconds = Math.min(
            22,
            Math.max(
                0.5,
                Number(
                    configService.get<string>(
                        'ELEVENLABS_SFX_DURATION_SECONDS',
                    ) ?? '5',
                ),
            ),
        );
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

    async listAccessibleVoices(): Promise<ElevenLabsVoiceOption[]> {
        if (
            this.voicesCache &&
            Date.now() - this.voicesCache.fetchedAt < this.voicesCacheTtlMs
        ) {
            return this.voicesCache.voices;
        }

        try {
            this.ensureApiKey();
            const response = await this.get<{
                voices?: Array<{
                    voice_id: string;
                    name: string;
                    preview_url?: string | null;
                    labels?: {
                        gender?: string | null;
                        use_case?: string | null;
                        age?: string | null;
                    } | null;
                }>;
            }>('/voices');

            const voices = (response.voices ?? [])
                .filter((voice) => voice.voice_id && voice.name)
                .map((voice) => {
                    const labels = resolveElevenLabsVoiceLabels(
                        voice.voice_id,
                        voice.name,
                    );
                    const catalogVoice = ELEVENLABS_VOICE_CATALOG.find(
                        (item) => item.id === voice.voice_id,
                    );
                    return {
                        id: voice.voice_id,
                        labelRu: labels.labelRu,
                        labelEn: labels.labelEn,
                        gender:
                            mapElevenLabsGender(voice.labels?.gender) ??
                            catalogVoice?.gender,
                        useCase:
                            mapElevenLabsUseCase(voice.labels?.use_case) ??
                            catalogVoice?.useCase,
                        age: voice.labels?.age ?? null,
                        previewUrl: voice.preview_url ?? null,
                    };
                })
                .sort((left, right) =>
                    left.labelRu.localeCompare(right.labelRu, 'ru'),
                );

            if (voices.length) {
                this.voicesCache = {
                    fetchedAt: Date.now(),
                    voices,
                };
                return voices;
            }
        } catch (error) {
            this.logger.warn(
                {
                    err: error instanceof Error ? error.message : String(error),
                },
                'Failed to fetch ElevenLabs voices, using fallback catalog',
            );
        }

        return [...ELEVENLABS_VOICE_CATALOG];
    }

    async createJob(
        toolId: AiToolId,
        input: AiGenerationInput,
    ): Promise<AiJobCreateResult> {
        this.ensureApiKey();

        if (toolId !== AiToolId.VIDEO_TO_AUDIO) {
            throw new Error(`ElevenLabs async job not supported for ${toolId}`);
        }

        const mediaFile = input.files?.find((f) => this.isDubbingMediaFile(f));

        if (!mediaFile) {
            throw new Error('Отправьте видео или аудиофайл для дубляжа');
        }

        const targetLang = this.resolveTargetLang(input.prompt);
        const safeName = this.sanitizeUploadFileName(
            mediaFile.fileName,
            mediaFile.mimeType,
        );
        const mimeType = this.resolveUploadMimeType(
            mediaFile.mimeType,
            safeName,
        );
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(mediaFile.buffer)], {
            type: mimeType,
        });
        formData.append('file', blob, safeName);
        formData.append('target_lang', targetLang);
        formData.append('source_lang', 'auto');

        this.logger.info(
            {
                toolId,
                fileName: safeName,
                mimeType,
                bytes: mediaFile.buffer.length,
                targetLang,
            },
            'Submitting ElevenLabs dubbing job',
        );

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
            return {
                status,
                errorMessage: this.localizeDubbingError(
                    response.error ??
                        'Не удалось выполнить дубляж — сбой на стороне провайдера.',
                ),
            };
        }

        if (status === 'completed') {
            const lang =
                targetLang ||
                response.target_languages?.[0] ||
                this.dubbingTargetLang;
            // Тип медиа определяем при скачивании по содержимому файла.
            // Не угадываем audio/mpeg — иначе video mp4 ошибочно уходит в audio.
            const contentType =
                response.media_metadata?.content_type ??
                'application/octet-stream';
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
        const { buffer, mimeType } = await this.downloadDubbedMedia(
            dubbingId,
            lang,
        );
        const classified = this.classifyDubbingMedia(
            buffer,
            mimeType,
            result.mimeType,
        );

        return {
            type: classified.type,
            buffer,
            mimeType: classified.mimeType,
            // Keep a resolvable URL so mini-app / media proxy can fetch again.
            url: buildElevenLabsDubbingResultUrl(
                dubbingId,
                lang,
                classified.mimeType,
            ),
        };
    }

    private async textToSpeech(
        input: AiGenerationInput,
    ): Promise<AiGenerationResult> {
        const text = (input.prompt ?? '').slice(0, MAX_TEXT_LENGTH);

        if (!text.trim()) {
            throw new Error('Отправьте текст для озвучки');
        }

        const voiceId = input.elevenLabsVoiceId ?? this.voiceId;
        const buffer = await this.synthesizeSpeech(voiceId, text);

        return {
            type: 'audio',
            buffer,
            mimeType: 'audio/mpeg',
        };
    }

    async synthesizeSpeech(voiceId: string, text: string): Promise<Buffer> {
        this.ensureApiKey();

        return this.postBinary(
            `/text-to-speech/${voiceId}`,
            {
                text: text.slice(0, MAX_TEXT_LENGTH),
                model_id: this.modelId,
                // Без language_code цифры/даты часто озвучиваются по-английски.
                language_code: this.ttsLanguageCode,
                apply_text_normalization: 'on',
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'audio/mpeg',
                },
                timeout: 120000,
            },
        );
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
            const buffer = await this.synthesizeSpeech(voiceId, input.prompt);

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

        const apiPrompt =
            await this.openRouterProvider.prepareSoundEffectPrompt(
                input.prompt,
            );
        const durationSeconds = Math.min(
            22,
            Math.max(0.5, input.durationSeconds ?? this.sfxDurationSeconds),
        );

        this.logger.info(
            {
                userPrompt: input.prompt.trim().slice(0, 200),
                apiPrompt: apiPrompt.slice(0, 300),
                durationSeconds,
                promptInfluence: this.sfxPromptInfluence,
                modelId: this.sfxModelId,
            },
            'ElevenLabs sound effect request',
        );

        const buffer = await this.postBinary(
            '/sound-generation',
            {
                text: apiPrompt,
                duration_seconds: durationSeconds,
                prompt_influence: this.sfxPromptInfluence,
                model_id: this.sfxModelId,
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
    ): Promise<{ buffer: Buffer; mimeType: string }> {
        return this.getBinaryWithMime(
            `/dubbing/${dubbingId}/audio/${languageCode}`,
            300000,
        );
    }

    private looksLikeMp4(buffer: Buffer): boolean {
        if (buffer.length < 12) return false;
        return (
            buffer.subarray(4, 8).toString('ascii') === 'ftyp' ||
            buffer.subarray(0, 3).toString('ascii') === 'F4V'
        );
    }

    /**
     * Сначала смотрим байты файла. Content-Type/hint часто врут
     * (audio/mpeg по умолчанию, audio/mp4 для контейнера с картинкой).
     */
    private classifyDubbingMedia(
        buffer: Buffer,
        headerMime: string,
        hintMime?: string | null,
    ): { type: 'video' | 'audio'; mimeType: string } {
        if (this.looksLikeMp3(buffer)) {
            return { type: 'audio', mimeType: 'audio/mpeg' };
        }

        if (this.hasMp4VideoTrack(buffer)) {
            return { type: 'video', mimeType: 'video/mp4' };
        }

        if (this.looksLikeAudioOnlyMp4(buffer)) {
            return { type: 'audio', mimeType: 'audio/mp4' };
        }

        if (this.looksLikeMp4(buffer)) {
            // ftyp есть, vide-хендлер не нашли в превью — всё равно video,
            // если это не явный M4A (уже отфильтрован выше).
            return { type: 'video', mimeType: 'video/mp4' };
        }

        const mime = (headerMime || hintMime || '')
            .split(';')[0]
            .trim()
            .toLowerCase();

        if (mime.startsWith('video/')) {
            return { type: 'video', mimeType: mime };
        }
        if (mime.startsWith('audio/')) {
            return { type: 'audio', mimeType: mime };
        }

        return { type: 'audio', mimeType: 'audio/mpeg' };
    }

    private looksLikeMp3(buffer: Buffer): boolean {
        if (buffer.length < 3) return false;
        if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return true;
        return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    }

    private looksLikeAudioOnlyMp4(buffer: Buffer): boolean {
        if (!this.looksLikeMp4(buffer) || buffer.length < 12) return false;
        if (this.hasMp4VideoTrack(buffer)) return false;
        const brand = buffer.subarray(8, 12).toString('ascii');
        if (brand === 'M4A ' || brand === 'M4B ' || brand === 'mp4a') {
            return true;
        }
        const head = buffer
            .subarray(8, Math.min(buffer.length, 64))
            .toString('ascii');
        return head.includes('M4A ') || head.includes('M4B ');
    }

    /** ISO-BMFF: ищем hdlr с handler_type = 'vide' в начале файла. */
    private hasMp4VideoTrack(buffer: Buffer): boolean {
        if (!this.looksLikeMp4(buffer)) return false;
        const limit = Math.min(buffer.length - 20, 4 * 1024 * 1024);
        for (let i = 0; i < limit; i++) {
            if (
                buffer[i] === 0x68 && // h
                buffer[i + 1] === 0x64 && // d
                buffer[i + 2] === 0x6c && // l
                buffer[i + 3] === 0x72 // r
            ) {
                // hdlr: version(1)+flags(3)+pre_defined(4)+handler_type(4) → +16
                const handler = buffer.subarray(i + 16, i + 20).toString('ascii');
                if (handler === 'vide') return true;
            }
        }
        return false;
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
        const { buffer } = await this.getBinaryWithMime(path, timeout);
        return buffer;
    }

    private async getBinaryWithMime(
        path: string,
        timeout = 30000,
    ): Promise<{ buffer: Buffer; mimeType: string }> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<ArrayBuffer>(`${this.baseUrl}${path}`, {
                    headers: { 'xi-api-key': this.apiKey },
                    responseType: 'arraybuffer',
                    timeout,
                }),
            );
            const headerType = response.headers?.['content-type'];
            const mimeType =
                typeof headerType === 'string'
                    ? headerType.split(';')[0].trim()
                    : 'application/octet-stream';
            return {
                buffer: Buffer.from(response.data),
                mimeType,
            };
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

    private isDubbingMediaFile(file: {
        mimeType: string;
        fileName?: string;
    }): boolean {
        const mime = file.mimeType?.toLowerCase() ?? '';
        if (mime.startsWith('video/') || mime.startsWith('audio/')) {
            return true;
        }
        if (mime === 'application/octet-stream' || mime === '') {
            return /\.(mp4|mov|webm|mkv|mp3|wav|m4a|ogg|aac)$/i.test(
                file.fileName ?? '',
            );
        }
        return false;
    }

    private sanitizeUploadFileName(
        fileName: string | undefined,
        mimeType: string,
    ): string {
        const original = fileName?.trim() || 'media';
        const extensionMatch = original.match(/(\.[a-z0-9]{2,5})$/i);
        const fromMime = mimeType.includes('audio')
            ? '.mp3'
            : mimeType.includes('video')
              ? '.mp4'
              : '';
        const extension = (
            extensionMatch?.[1] ||
            fromMime ||
            '.mp4'
        ).toLowerCase();
        const base = original
            .replace(/\.[a-z0-9]{2,5}$/i, '')
            .replace(/[^a-zA-Z0-9._-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 64);
        return `${base || 'media'}${extension}`;
    }

    private resolveUploadMimeType(mimeType: string, fileName: string): string {
        const mime = mimeType?.toLowerCase() ?? '';
        if (mime.startsWith('video/') || mime.startsWith('audio/')) {
            return mime;
        }
        const ext = fileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'mp4':
                return 'video/mp4';
            case 'mov':
                return 'video/quicktime';
            case 'webm':
                return 'video/webm';
            case 'mkv':
                return 'video/x-matroska';
            case 'mp3':
                return 'audio/mpeg';
            case 'wav':
                return 'audio/wav';
            case 'm4a':
                return 'audio/mp4';
            case 'ogg':
                return 'audio/ogg';
            case 'aac':
                return 'audio/aac';
            default:
                return mime || 'application/octet-stream';
        }
    }

    private localizeDubbingError(message: string): string {
        const lower = message.toLowerCase();
        if (
            lower.includes("couldn't extract audio") ||
            lower.includes('could not extract audio') ||
            lower.includes('extract audio')
        ) {
            return (
                'Не удалось извлечь речь из файла. Для озвучки нужно видео/аудио ' +
                'с голосом (не беззвучный ролик). Попробуйте другой файл.'
            );
        }
        return message;
    }

    private resolveTargetLang(prompt?: string): string {
        const trimmed = prompt?.trim().toLowerCase();
        if (!trimmed) {
            return this.dubbingTargetLang;
        }

        if (/^[a-z]{2,3}$/.test(trimmed)) {
            return trimmed;
        }

        const aliases: Array<{ code: string; patterns: RegExp[] }> = [
            {
                code: 'en',
                patterns: [/англ/, /\benglish\b/, /\beng\b/],
            },
            {
                code: 'ru',
                patterns: [/русск/, /\brussian\b/],
            },
            {
                code: 'es',
                patterns: [/испан/, /\bspanish\b/, /\bespa[nñ]ol\b/],
            },
            {
                code: 'de',
                patterns: [/немец/, /\bgerman\b/, /\bdeutsch\b/],
            },
            {
                code: 'fr',
                patterns: [/франц/, /\bfrench\b/, /\bfran[cç]ais\b/],
            },
            {
                code: 'it',
                patterns: [/итал/, /\bitalian\b/, /\bitaliano\b/],
            },
            {
                code: 'pt',
                patterns: [/португ/, /\bportuguese\b/, /\bportugu[eê]s\b/],
            },
            {
                code: 'zh',
                patterns: [/китай/, /\bchinese\b/, /\bmandarin\b/],
            },
            {
                code: 'ja',
                patterns: [/япон/, /\bjapanese\b/],
            },
            {
                code: 'ko',
                patterns: [/корей/, /\bkorean\b/],
            },
            {
                code: 'tr',
                patterns: [/турец/, /\bturkish\b/],
            },
            {
                code: 'pl',
                patterns: [/польск/, /\bpolish\b/],
            },
            {
                code: 'uk',
                patterns: [/украин/, /\bukrainian\b/],
            },
            {
                code: 'ar',
                patterns: [/араб/, /\barabic\b/],
            },
            {
                code: 'hi',
                patterns: [/хинди/, /\bhindi\b/],
            },
        ];

        for (const { code, patterns } of aliases) {
            if (patterns.some((pattern) => pattern.test(trimmed))) {
                return code;
            }
        }

        const isoInText = trimmed.match(/(?:^|[^\p{L}])([a-z]{2})(?:$|[^\p{L}])/u);
        if (isoInText) {
            const code = isoInText[1];
            const known = new Set(aliases.map((item) => item.code));
            // Also allow common ISO codes not in alias list
            known.add('nl');
            known.add('sv');
            known.add('cs');
            known.add('ro');
            known.add('id');
            known.add('vi');
            known.add('th');
            if (known.has(code)) {
                return code;
            }
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
            throw new Error('Сервис временно недоступен. Попробуйте позже.');
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
        return 'Сбой на стороне провайдера';
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
                return 'Сервис временно недоступен. Попробуйте позже.';
            }
            if (status === 402) {
                return 'Недостаточно квоты у провайдера для этой операции.';
            }
            if (status === 403) {
                return 'Доступ к сервису ограничён. Попробуйте позже.';
            }
            if (status) {
                return `Сбой на стороне провайдера (HTTP ${status}).`;
            }
        }

        return error instanceof Error
            ? error.message
            : 'Сбой на стороне провайдера';
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
