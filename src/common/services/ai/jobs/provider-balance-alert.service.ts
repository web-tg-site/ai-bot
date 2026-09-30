import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { getToolById } from '@/common/config/ai-tools.registry';
import { BotService } from '@/common/services/bot';
import { AiToolId } from '../types';
import { isProviderBalanceError } from './provider-balance-error';

const DEBOUNCE_MS = 10 * 60 * 1000;

@Injectable()
export class ProviderBalanceAlertService {
    private readonly lastAlertAtByTool = new Map<string, number>();

    constructor(
        @InjectPinoLogger(ProviderBalanceAlertService.name)
        private readonly logger: PinoLogger,
        private readonly configService: ConfigService,
        private readonly moduleRef: ModuleRef,
    ) {}

    notifyIfNeeded(toolId: AiToolId, errorMessage: string): void {
        if (!isProviderBalanceError(errorMessage)) {
            return;
        }

        const chatId = this.configService
            .get<string>('CHAT_MODEL_DENAY')
            ?.trim();
        if (!chatId) {
            return;
        }

        const now = Date.now();
        const lastAt = this.lastAlertAtByTool.get(toolId) ?? 0;
        if (now - lastAt < DEBOUNCE_MS) {
            return;
        }
        this.lastAlertAtByTool.set(toolId, now);

        void this.sendAlert(chatId, toolId, now).catch((error: unknown) => {
            this.logger.warn(
                {
                    toolId,
                    chatId,
                    err: error instanceof Error ? error.message : String(error),
                },
                'Failed to send provider balance alert',
            );
        });
    }

    private async sendAlert(
        chatId: string,
        toolId: AiToolId,
        atMs: number,
    ): Promise<void> {
        const tool = getToolById(toolId);
        const modelLabel = tool?.model
            ? `${tool.label} (${tool.model})`
            : (tool?.label ?? toolId);
        const provider = tool?.provider ?? 'unknown';
        const timeUtc = new Date(atMs)
            .toISOString()
            .replace('T', ' ')
            .replace(/\.\d{3}Z$/, ' UTC');

        const message = [
            '⚠️ <b>Закончился баланс у провайдера</b>',
            '',
            `Модель: <code>${escapeHtml(modelLabel)}</code>`,
            `Подключение: <code>${escapeHtml(String(provider))}</code>`,
            `Время: <code>${timeUtc}</code>`,
        ].join('\n');

        const botService = this.moduleRef.get(BotService, { strict: false });
        await botService.sendMessage(chatId, message, { parse_mode: 'HTML' });

        this.logger.warn(
            { toolId, provider, chatId, timeUtc },
            'Provider balance alert sent',
        );
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
