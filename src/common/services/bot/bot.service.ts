import {
    Injectable,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf, session } from 'telegraf';
import { Redis } from '@telegraf/session/redis';
import { ALLOWED_UPDATES } from './consts';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserModelService } from '@/common/models/user';
import { GptConversationModelService } from '@/common/models/gpt-conversation';
import { UserAiToolSettingsModelService } from '@/common/models/user-ai-tool-settings';
import { registerGlobalHandler } from './handlers';
import { ExtraReplyMessage } from 'node_modules/telegraf/typings/telegram-types';
import {
    AiService,
    AiJobService,
    ImageCapabilitiesService,
    VideoCapabilitiesService,
    TokenBillingService,
    BotSession,
    ElevenLabsVoicePreviewService,
    ModelFailoverService,
} from '@/common/services/ai';
import { RedisService } from '@/common/services/redis';
import { CryptoPayService } from '@/common/services/crypto-pay';
import { AntilopayService } from '@/common/services/antilopay';
import { bufferToInputFile } from './utils/download-telegram-file';
import { deliverVideoBuffer } from './utils/media-delivery';
import {
    mimeTypeToExtension,
    parseDataUrl,
} from '@/common/utils/parse-data-url';
import {
    downloadRemoteFile,
    getAuthHeadersForUrl,
} from '@/common/utils/download-remote-file';

@Injectable()
export class BotService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly bot: Telegraf<Context & { session: BotSession }>;
    private botUsername: string | undefined;

    constructor(
        @InjectPinoLogger(BotService.name)
        private readonly logger: PinoLogger,
        private readonly configService: ConfigService,
        private readonly userModelService: UserModelService,
        private readonly gptConversationModelService: GptConversationModelService,
        private readonly userAiToolSettingsModelService: UserAiToolSettingsModelService,
        private readonly imageCapabilitiesService: ImageCapabilitiesService,
        private readonly videoCapabilitiesService: VideoCapabilitiesService,
        private readonly aiService: AiService,
        private readonly tokenBillingService: TokenBillingService,
        private readonly aiJobService: AiJobService,
        private readonly modelFailoverService: ModelFailoverService,
        private readonly redisService: RedisService,
        private readonly cryptoPayService: CryptoPayService,
        private readonly antilopayService: AntilopayService,
        private readonly elevenLabsVoicePreviewService: ElevenLabsVoicePreviewService,
    ) {
        const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is not set');
        }

        this.bot = new Telegraf<Context & { session: BotSession }>(token);
        this.setupSession();
        this.bot.catch((err, ctx) => {
            this.logger.error(
                `Telegraf error: ${err instanceof Error ? err.message : String(err)} update=${ctx?.updateType}`,
            );
        });
    }

    private setupSession() {
        const redisClient = this.redisService.getClient();

        const defaultSession = (): BotSession => ({});

        if (redisClient) {
            const store = Redis<BotSession>({
                client: redisClient,
            });
            this.bot.use(session({ store, defaultSession }));
        } else {
            this.bot.use(session({ defaultSession }));
        }
    }

    public async onApplicationBootstrap() {
        this.registerHandlers();

        const me = await this.bot.telegram.getMe();
        this.botUsername = me.username;
        this.cryptoPayService.setBotUsername(me.username);
        this.logger.info({ username: me.username }, 'Bot starting');

        const miniAppUrl = this.configService
            .get<string>('MINI_APP_URL')
            ?.trim();
        if (miniAppUrl) {
            try {
                await this.bot.telegram.setChatMenuButton({
                    menuButton: {
                        type: 'web_app',
                        text: 'App',
                        web_app: { url: miniAppUrl },
                    },
                });
                this.logger.info(
                    { miniAppUrl },
                    'Chat menu button set to mini-app',
                );
            } catch (err) {
                this.logger.warn(
                    `Failed to set chat menu button: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        } else {
            this.logger.warn(
                'MINI_APP_URL is not set — mini-app button disabled',
            );
        }

        void this.bot
            .launch({
                dropPendingUpdates: true,
                allowedUpdates: [...ALLOWED_UPDATES],
            })
            .catch((err: unknown) => {
                this.logger.error(
                    `Bot launch failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            });

        this.logger.info('Bot launch initiated');
    }

    public getUsername(): string | undefined {
        return this.botUsername;
    }

    public onModuleDestroy() {
        this.bot.stop();
        this.logger.info('Bot stopped');
    }

    public async sendMessage(
        chatId: string,
        message: string,
        options?: ExtraReplyMessage,
    ) {
        await this.bot.telegram.sendMessage(chatId, message, options);
    }

    public async sendPhoto(chatId: string, url: string, caption?: string) {
        const parsed = parseDataUrl(url);
        if (parsed) {
            await this.sendPhotoBuffer(chatId, parsed.buffer, parsed.mimeType, false, caption);
            return;
        }

        const { buffer, mimeType } = await downloadRemoteFile(
            url,
            getAuthHeadersForUrl(url),
        );
        await this.sendPhotoBuffer(chatId, buffer, mimeType, false, caption);
    }

    public async sendPhotoBuffer(
        chatId: string,
        buffer: Buffer,
        mimeType = 'image/png',
        sendAsFile = false,
        caption?: string,
    ) {
        const ext = mimeTypeToExtension(mimeType, 'png');
        const inputFile = bufferToInputFile(buffer, `image.${ext}`);
        const extra = caption ? { caption } : undefined;
        if (sendAsFile) {
            await this.bot.telegram.sendDocument(chatId, inputFile, extra);
            return;
        }
        await this.bot.telegram.sendPhoto(chatId, inputFile, extra);
    }

    public async sendPhotoBufferAsDocument(
        chatId: string,
        buffer: Buffer,
        mimeType = 'image/png',
    ) {
        await this.sendPhotoBuffer(chatId, buffer, mimeType, true);
    }

    public async sendVideo(chatId: string, url: string, caption?: string) {
        const parsed = parseDataUrl(url);
        if (parsed) {
            await this.sendVideoBuffer(chatId, parsed.buffer, parsed.mimeType, false, caption);
            return;
        }

        const { buffer, mimeType } = await downloadRemoteFile(
            url,
            getAuthHeadersForUrl(url),
        );
        await this.sendVideoBuffer(chatId, buffer, mimeType, false, caption);
    }

    public async sendVideoBuffer(
        chatId: string,
        buffer: Buffer,
        mimeType = 'video/mp4',
        sendAsFile = false,
        caption?: string,
    ) {
        await deliverVideoBuffer(
            {
                sendVideo: (file, extra) =>
                    this.bot.telegram.sendVideo(chatId, file, {
                        ...extra,
                        ...(caption ? { caption } : {}),
                    }),
                sendDocument: (file) =>
                    this.bot.telegram.sendDocument(chatId, file, caption ? { caption } : undefined),
            },
            buffer,
            mimeType,
            sendAsFile,
        );
    }

    public async sendAudio(chatId: string, url: string) {
        const { buffer, mimeType } = await downloadRemoteFile(
            url,
            getAuthHeadersForUrl(url),
        );
        await this.sendAudioBuffer(chatId, buffer, mimeType);
    }

    public async sendAudioBuffer(
        chatId: string,
        buffer: Buffer,
        mimeType = 'audio/mpeg',
        sendAsFile = true,
    ) {
        const ext = mimeTypeToExtension(mimeType, 'mp3');
        const inputFile = bufferToInputFile(buffer, `audio.${ext}`);
        if (sendAsFile) {
            await this.bot.telegram.sendAudio(chatId, inputFile);
            return;
        }
        await this.bot.telegram.sendVoice(
            chatId,
            bufferToInputFile(buffer, `voice.${ext}`),
        );
    }

    public async sendVoiceBuffer(
        chatId: string,
        buffer: Buffer,
        mimeType = 'audio/mpeg',
    ) {
        await this.sendAudioBuffer(chatId, buffer, mimeType, false);
    }

    private registerHandlers() {
        registerGlobalHandler(this.bot, {
            userModelService: this.userModelService,
            gptConversationModelService: this.gptConversationModelService,
            userAiToolSettingsModelService: this.userAiToolSettingsModelService,
            imageCapabilitiesService: this.imageCapabilitiesService,
            videoCapabilitiesService: this.videoCapabilitiesService,
            aiService: this.aiService,
            tokenBillingService: this.tokenBillingService,
            aiJobService: this.aiJobService,
            modelFailoverService: this.modelFailoverService,
            cryptoPayService: this.cryptoPayService,
            antilopayService: this.antilopayService,
            elevenLabsVoicePreviewService: this.elevenLabsVoicePreviewService,
            redisService: this.redisService,
        });
    }
}
