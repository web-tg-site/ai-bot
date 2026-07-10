import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import path from 'path';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '@/common/services/prisma';
import { ElevenLabsProvider } from '@/common/services/ai/providers/elevenlabs.provider';
import { getVoicePreviewSampleText } from '@/common/config/elevenlabs-voices.config';

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
    }

    private async ensureStorageDir() {
        await fs.mkdir(this.storageDir, { recursive: true, mode: 0o755 });
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

        await this.ensureStorageDir();
        const fileName = `${voiceId}_${localeTag}.mp3`;
        const filePath = path.join(this.storageDir, fileName);
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

        return buffer;
    }
}
