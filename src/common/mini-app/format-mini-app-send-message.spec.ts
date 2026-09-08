import { AiToolId } from '@/common/services/ai/types';
import { UserLanguage } from '@/generated/prisma/enums';
import {
    formatMiniAppSendMessage,
    resolveMiniAppJobPrompt,
} from './format-mini-app-send-message';

const MANIFEST_ONLY = `Вложения (теги для промпта):
- @video1 — 1-е прикреплённое видео (по порядку)
Теги @image1 / @video1 / @file1 ссылаются на вложения по типу, нумерация с 1 в порядке прикрепления.

Задача пользователя:
Строго следуй прикреплённым референсам`;

describe('formatMiniAppSendMessage', () => {
    it('hides the attachment manifesto when sending a result to Telegram', () => {
        const message = formatMiniAppSendMessage({
            jobId: 'job-1',
            toolId: AiToolId.TOPAZ,
            prompt: '',
            inputJson: { prompt: MANIFEST_ONLY, topazScale: 2 },
            tokenCost: 80,
            tokenLeft: 120,
            language: UserLanguage.RU,
        });

        expect(message).not.toContain('Вложения');
        expect(message).not.toContain('@video1');
        expect(message).not.toContain('📍 Ваш запрос:');
        expect(message).toContain('×2');
    });

    it('keeps the real user task after the manifesto', () => {
        expect(
            resolveMiniAppJobPrompt(
                '',
                {
                    prompt: `Вложения (теги для промпта):
- @video1 — 1-е прикреплённое видео (по порядку)

Задача пользователя:
сделай кинематографичнее`,
                },
            ),
        ).toBe('сделай кинематографичнее');
    });
});
