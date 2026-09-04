import {
    buildNumberedReferencePrompt,
    formatAttachmentMention,
    getAttachmentMentionIndex1,
    getAttachmentMentionKind,
    getReferenceLabel,
} from './image-references';

describe('attachment mentions', () => {
    it('numbers kinds separately in upload order', () => {
        const files = [
            { mimeType: 'image/jpeg', fileName: 'a.jpg' },
            { mimeType: 'application/pdf', fileName: 'doc.pdf' },
            { mimeType: 'image/png', fileName: 'b.png' },
            { mimeType: 'video/mp4', fileName: 'c.mp4' },
        ];

        expect(getAttachmentMentionKind(files[0]!)).toBe('image');
        expect(getAttachmentMentionIndex1(files, 0)).toBe(1);
        expect(formatAttachmentMention('image', 1)).toBe('@image1');

        expect(getAttachmentMentionKind(files[1]!)).toBe('file');
        expect(getAttachmentMentionIndex1(files, 1)).toBe(1);

        expect(getAttachmentMentionIndex1(files, 2)).toBe(2);
        expect(getAttachmentMentionIndex1(files, 3)).toBe(1);
        expect(getReferenceLabel(0, 'ru-RU', 'image')).toBe('@image1');
    });

    it('builds manifesto with @image / @video / @file tags', () => {
        const prompt = buildNumberedReferencePrompt(
            'замени лицо на @image2',
            [
                { mimeType: 'image/jpeg', fileName: 'a.jpg' },
                { mimeType: 'image/png', fileName: 'b.png' },
                { mimeType: 'video/mp4', fileName: 'c.mp4' },
            ],
            'ru-RU',
        );

        expect(prompt).toContain('@image1');
        expect(prompt).toContain('@image2');
        expect(prompt).toContain('@video1');
        expect(prompt).toContain('замени лицо на @image2');
        expect(prompt).toContain('Вложения (теги для промпта)');
    });
});
