import {
    buildMidjourneyImaginePrompt,
    MIDJOURNEY_REF_IMAGE_WEIGHT,
    MIDJOURNEY_REF_NO_TERMS,
    MIDJOURNEY_REF_STYLE_HINT,
} from './midjourney-prompt';
import { buildNumberedReferencePrompt } from '@/common/services/bot/utils/image-references';

describe('buildMidjourneyImaginePrompt', () => {
    const imageUrl = 'https://example.com/api/public/tmp/abc.jpg';

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
        expect(prompt).toContain(MIDJOURNEY_REF_STYLE_HINT);
        expect(prompt).toContain(`--iw ${MIDJOURNEY_REF_IMAGE_WEIGHT}`);
        expect(prompt).toContain(`--no ${MIDJOURNEY_REF_NO_TERMS}`);
        expect(prompt.startsWith(imageUrl)).toBe(true);
        expect(prompt.endsWith('--q 1')).toBe(true);
    });

    it('adds iw/no flags and style hint when refs are present', () => {
        const prompt = buildMidjourneyImaginePrompt({
            imageUrls: [imageUrl],
            rawPrompt: 'watercolor style',
            qualityQ: '0.5',
        });

        expect(prompt).toBe(
            `${imageUrl} watercolor style, ${MIDJOURNEY_REF_STYLE_HINT} --iw ${MIDJOURNEY_REF_IMAGE_WEIGHT} --no ${MIDJOURNEY_REF_NO_TERMS} --q 0.5`,
        );
    });

    it('does not add ref flags without refs', () => {
        const prompt = buildMidjourneyImaginePrompt({
            imageUrls: [],
            rawPrompt: 'a red dragon',
            qualityQ: 2,
        });

        expect(prompt).toBe('a red dragon --q 2');
        expect(prompt).not.toContain('--iw');
        expect(prompt).not.toContain('--no');
    });

    it('strips existing --q / --iw / --no and @image tags from user text', () => {
        const prompt = buildMidjourneyImaginePrompt({
            imageUrls: [imageUrl],
            rawPrompt: 'cat @image1 --q 0.5 --iw 1 --no dogs --stylize 50 portrait',
            qualityQ: 1,
        });

        expect(prompt).not.toContain('@image1');
        expect(prompt).toContain('cat');
        expect(prompt).toContain('portrait');
        expect(prompt).toContain('--stylize 50');
        expect(prompt).toContain(`--iw ${MIDJOURNEY_REF_IMAGE_WEIGHT}`);
        expect(prompt.endsWith('--q 1')).toBe(true);
        expect(prompt.match(/--q/g)?.length).toBe(1);
        expect(prompt.match(/--iw/g)?.length).toBe(1);
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
            'reimagine the reference photo in the requested style, keep the exact same subject',
        );
        expect(prompt).toContain(`--iw ${MIDJOURNEY_REF_IMAGE_WEIGHT}`);
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
