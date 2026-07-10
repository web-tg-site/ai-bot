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
} from '@/common/services/ai';
import { RedisService } from '@/common/services/redis';
import { CryptoPayService } from '@/common/services/crypto-pay';
import { bufferToInputFile } from './utils/download-telegram-file';
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
        private readonly redisService: RedisService,
        private readonly cryptoPayService: CryptoPayService,
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
        this.cryptoPayService.setBotUsername(me.username);
        this.logger.info({ username: me.username }, 'Bot starting');

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

    public async sendPhoto(chatId: string, url: string) {
        const parsed = parseDataUrl(url);
        if (parsed) {
            await this.sendPhotoBuffer(chatId, parsed.buffer, parsed.mimeType);
            return;
        }

        const { buffer, mimeType } = await downloadRemoteFile(
            url,
            getAuthHeadersForUrl(url),
        );
        await this.sendPhotoBuffer(chatId, buffer, mimeType);
    }

    public async sendPhotoBuffer(
        chatId: string,
        buffer: Buffer,
        mimeType = 'image/png',
    ) {
        const ext = mimeTypeToExtension(mimeType, 'png');
        await this.bot.telegram.sendPhoto(
            chatId,
            bufferToInputFile(buffer, `image.${ext}`),
        );
    }

    public async sendVideo(chatId: string, url: string) {
        const parsed = parseDataUrl(url);
        if (parsed) {
            await this.sendVideoBuffer(chatId, parsed.buffer, parsed.mimeType);
            return;
        }

        const { buffer, mimeType } = await downloadRemoteFile(
            url,
            getAuthHeadersForUrl(url),
        );
        await this.sendVideoBuffer(chatId, buffer, mimeType);
    }

    public async sendVideoBuffer(
        chatId: string,
        buffer: Buffer,
        mimeType = 'video/mp4',
    ) {
        const ext = mimeTypeToExtension(mimeType, 'mp4');
        await this.bot.telegram.sendVideo(
            chatId,
            bufferToInputFile(buffer, `video.${ext}`),
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
    ) {
        const ext = mimeTypeToExtension(mimeType, 'mp3');
        await this.bot.telegram.sendAudio(
            chatId,
            bufferToInputFile(buffer, `audio.${ext}`),
        );
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
            cryptoPayService: this.cryptoPayService,
        });
    }
}
