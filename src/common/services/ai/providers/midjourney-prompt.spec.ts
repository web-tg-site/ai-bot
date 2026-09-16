import {
    buildMidjourneyImaginePrompt,
    MIDJOURNEY_REF_ANTI_SPLIT_SUFFIX,
} from './midjourney-prompt';
import { buildNumberedReferencePrompt } from '@/common/services/bot/utils/image-references';

describe('buildMidjourneyImaginePrompt', () => {
    const imageUrl = 'https://example.com/api/public/tmp/abc';

    it('strips attachment manifesto and keeps only the user task', () => {
        const enriched = buildNumberedReferencePrompt(
            'сделай в стиле акварели',
            [{ mimeType: 'image/jpeg', fileName: 'cat.jpg' }],
            'ru-RU',
        );

        const prompt = buildMidjourneyImaginePrompt({
            imageUrls: [imageUrl],
            rawPrompt: enriched,
            qualityQ: 1,
        });

        expect(prompt).not.toContain('Вложения');
        expect(prompt).not.toContain('@image1');
        expect(prompt).not.toContain('Задача пользователя');
        expect(prompt).toContain('сделай в стиле акварели');
        expect(prompt).toContain(MIDJOURNEY_REF_ANTI_SPLIT_SUFFIX);
        expect(prompt.startsWith(imageUrl)).toBe(true);
        expect(prompt.endsWith('--q 1')).toBe(true);
    });

    it('adds anti-split suffix when refs are present', () => {
        const prompt = buildMidjourneyImaginePrompt({
            imageUrls: [imageUrl],
            rawPrompt: 'watercolor style',
            qualityQ: '0.5',
        });

        expect(prompt).toBe(
            `${imageUrl} watercolor style ${MIDJOURNEY_REF_ANTI_SPLIT_SUFFIX} --q 0.5`,
        );
    });

    it('does not add anti-split suffix without refs', () => {
        const prompt = buildMidjourneyImaginePrompt({
            imageUrls: [],
            rawPrompt: 'a red dragon',
            qualityQ: 2,
        });

        expect(prompt).toBe('a red dragon --q 2');
        expect(prompt).not.toContain(MIDJOURNEY_REF_ANTI_SPLIT_SUFFIX);
    });

    it('strips an existing --q from the user text', () => {
        const prompt = buildMidjourneyImaginePrompt({
            imageUrls: [],
            rawPrompt: 'cat --q 0.5 portrait',
            qualityQ: 1,
        });

        expect(prompt).toBe('cat portrait --q 1');
    });

    it('uses default ref text when manifesto-only prompt leaves empty task', () => {
        const enriched = buildNumberedReferencePrompt(
            'Строго следуй прикреплённым референсам',
            [{ mimeType: 'image/jpeg', fileName: 'cat.jpg' }],
            'ru-RU',
        );

        const prompt = buildMidjourneyImaginePrompt({
            imageUrls: [imageUrl],
            rawPrompt: enriched,
            qualityQ: 1,
        });

        expect(prompt).not.toContain('Вложения');
        expect(prompt).toContain(
            'Create an image consistent with the attached reference photos.',
        );
        expect(prompt).toContain(MIDJOURNEY_REF_ANTI_SPLIT_SUFFIX);
        expect(prompt.endsWith('--q 1')).toBe(true);
    });

    it('throws when there is no prompt and no refs', () => {
        expect(() =>
            buildMidjourneyImaginePrompt({
                imageUrls: [],
                rawPrompt: '   ',
                qualityQ: 1,
            }),
        ).toThrow('Midjourney requires a prompt');
    });
});
