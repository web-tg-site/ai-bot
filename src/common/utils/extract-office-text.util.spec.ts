import JSZip from 'jszip';
import sharp from 'sharp';
import {
    extractOfficeContent,
    extractOfficeText,
} from './extract-office-text.util';

const slideXml = (text: string) =>
    `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

const notesXml = (text: string) =>
    `<?xml version="1.0"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`;

const imageRels = (target: string) =>
    `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>
</Relationships>`;

async function packPptx(
    build: (zip: JSZip) => void | Promise<void>,
): Promise<Buffer> {
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', '<p:presentation/>');
    await build(zip);
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('extractOfficeText pptx', () => {
    it('extracts slide text in order', async () => {
        const buffer = await packPptx((zip) => {
            zip.file('ppt/slides/slide1.xml', slideXml('Intro title'));
            zip.file('ppt/slides/slide2.xml', slideXml('Roadmap'));
        });

        const text = await extractOfficeText(buffer, 'deck.pptx');
        expect(text).toContain('--- Slide 1 ---');
        expect(text).toContain('Intro title');
        expect(text).toContain('--- Slide 2 ---');
        expect(text).toContain('Roadmap');
    });

    it('extracts speaker notes', async () => {
        const buffer = await packPptx((zip) => {
            zip.file('ppt/slides/slide1.xml', slideXml('Visible'));
            zip.file(
                'ppt/notesSlides/notesSlide1.xml',
                notesXml('Say this aloud'),
            );
        });

        const text = await extractOfficeText(buffer, 'deck.pptx');
        expect(text).toContain('Visible');
        expect(text).toContain('Notes:');
        expect(text).toContain('Say this aloud');
    });

    it('detects pptx from zip contents when name/mime are missing', async () => {
        const buffer = await packPptx((zip) => {
            zip.file('ppt/slides/slide1.xml', slideXml('Nameless deck'));
        });

        const content = await extractOfficeContent(
            buffer,
            'upload.bin',
            'application/octet-stream',
        );
        expect(content?.kind).toBe('pptx');
        expect(content?.text).toContain('Nameless deck');
    });

    it('extracts raster images from slides and skips tiny icons', async () => {
        const photo = await sharp({
            create: {
                width: 160,
                height: 120,
                channels: 3,
                background: { r: 200, g: 40, b: 40 },
            },
        })
            .png()
            .toBuffer();
        const icon = await sharp({
            create: {
                width: 16,
                height: 16,
                channels: 3,
                background: { r: 0, g: 0, b: 0 },
            },
        })
            .png()
            .toBuffer();

        const buffer = await packPptx((zip) => {
            zip.file('ppt/slides/slide1.xml', slideXml('Photo slide'));
            zip.file(
                'ppt/slides/_rels/slide1.xml.rels',
                imageRels('../media/photo.png'),
            );
            zip.file('ppt/media/photo.png', photo);
            zip.file('ppt/slides/slide2.xml', slideXml('Icon slide'));
            zip.file(
                'ppt/slides/_rels/slide2.xml.rels',
                imageRels('../media/icon.png'),
            );
            zip.file('ppt/media/icon.png', icon);
        });

        const content = await extractOfficeContent(buffer, 'deck.pptx');
        expect(content?.images).toHaveLength(1);
        expect(content?.images[0]?.slideIndex).toBe(1);
        expect(content?.images[0]?.fileName).toBe('photo.png');
        expect(content?.text).toContain('Photo slide');
    });
});
