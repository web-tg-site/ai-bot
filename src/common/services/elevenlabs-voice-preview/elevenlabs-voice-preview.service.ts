import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import path from 'path';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '@/common/services/prisma';
import { ElevenLabsProvider } from '@/common/services/ai/providers/elevenlabs.provider';
import { getVoicePreviewSampleText } from '@/common/config/elevenlabs-voices.config';

function getNodeErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return undefined;
    }

    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
}

@Injectable()
export class ElevenLabsVoicePreviewService implements OnModuleInit {
    private readonly storageDir: string;

    constructor(
        private readonly prismaService: PrismaService,
        private readonly elevenLabsProvider: ElevenLabsProvider,
        configService: ConfigService,
        @InjectPinoLogger(ElevenLabsVoicePreviewService.name)
        private readonly logger: PinoLogger,
    ) {
        this.storageDir =
            configService.get<string>('VOICE_PREVIEWS_DIR') ??
            path.join(process.cwd(), 'storage', 'voice-previews');
    }

    async onModuleInit() {
        await this.ensureStorageDir();
        this.logger.info(
            { storageDir: this.storageDir },
            'Voice preview storage ready',
        );
    }

    private async ensureStorageDir() {
        await fs.mkdir(this.storageDir, { recursive: true, mode: 0o755 });
    }

    private async persistPreview(
        voiceId: string,
        localeTag: 'ru-RU' | 'en-US',
        sampleText: string,
        buffer: Buffer,
    ): Promise<void> {
        const fileName = `${voiceId}_${localeTag}.mp3`;
        const filePath = path.join(this.storageDir, fileName);

        try {
            await this.ensureStorageDir();
            await fs.writeFile(filePath, buffer);

            await this.prismaService.elevenLabsVoicePreview.upsert({
                where: {
                    voiceId_localeTag: { voiceId, localeTag },
                },
                create: {
                    voiceId,
                    localeTag,
                    filePath,
                    sampleText,
                },
                update: {
                    filePath,
                    sampleText,
                },
            });

            this.logger.info(
                { voiceId, localeTag, filePath },
                'Voice preview cached',
            );
        } catch (error: unknown) {
            const code = getNodeErrorCode(error);
            if (code === 'EACCES' || code === 'EPERM') {
                this.logger.warn(
                    {
                        voiceId,
                        localeTag,
                        storageDir: this.storageDir,
                        err:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    'Voice preview cache skipped: storage not writable',
                );
                return;
            }

            throw error;
        }
    }

    async getOrCreatePreview(
        voiceId: string,
        localeTag: 'ru-RU' | 'en-US',
    ): Promise<Buffer> {
        const sampleText = getVoicePreviewSampleText(localeTag);
        const existing =
            await this.prismaService.elevenLabsVoicePreview.findUnique({
                where: {
                    voiceId_localeTag: { voiceId, localeTag },
                },
            });

        if (existing) {
            try {
                const buffer = await fs.readFile(existing.filePath);
                if (buffer.length > 0) {
                    return buffer;
                }
            } catch (error) {
                this.logger.warn(
                    {
                        voiceId,
                        localeTag,
                        filePath: existing.filePath,
                        err:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    'Voice preview file missing, regenerating',
                );
            }
        }

        const buffer = await this.elevenLabsProvider.synthesizeSpeech(
            voiceId,
            sampleText,
        );

        await this.persistPreview(voiceId, localeTag, sampleText, buffer);

        return buffer;
    }
}
