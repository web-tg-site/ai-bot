import { posix as posixPath } from 'path';
import JSZip from 'jszip';
import imageSize from 'image-size';

export type OfficeOpenXmlKind = 'docx' | 'pptx' | 'xlsx';

export type OfficeExtractedImage = {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    slideIndex: number;
};

export type OfficeExtractedContent = {
    kind: OfficeOpenXmlKind;
    text: string;
    images: OfficeExtractedImage[];
};

/** Skip tiny icons / bullets; keep photos and slide screenshots. */
const MIN_SLIDE_IMAGE_EDGE = 96;
export const MAX_PPTX_SLIDE_IMAGES = 12;

const RASTER_MIME_BY_EXT: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jfif: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
};

/**
 * Extract text (and PPTX slide rasters) from modern Office Open XML.
 * Used for Claude via OpenRouter: sending Office as `type: "file"` + file-parser
 * often hangs/times out; local extraction is fast and reliable.
 */
export async function extractOfficeText(
    buffer: Buffer,
    fileName?: string | null,
    mimeType?: string | null,
): Promise<string | null> {
    const content = await extractOfficeContent(buffer, fileName, mimeType);
    return content ? content.text : null;
}

export async function extractOfficeContent(
    buffer: Buffer,
    fileName?: string | null,
    mimeType?: string | null,
): Promise<OfficeExtractedContent | null> {
    let kind = detectOfficeOpenXmlKind(fileName, mimeType);
    if (!kind && !looksLikeZip(buffer)) {
        return null;
    }

    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(buffer);
    } catch (error) {
        if (!kind) {
            return null;
        }
        throw error;
    }

    kind ??= detectKindFromZip(zip);
    if (!kind) {
        return null;
    }

    switch (kind) {
        case 'docx':
            return {
                kind,
                text: await extractDocxText(zip),
                images: [],
            };
        case 'pptx':
            return extractPptxContent(zip);
        case 'xlsx':
            return {
                kind,
                text: await extractXlsxText(zip),
                images: [],
            };
        default:
            return null;
    }
}

export function detectOfficeOpenXmlKind(
    fileName?: string | null,
    mimeType?: string | null,
): OfficeOpenXmlKind | null {
    const mime = (mimeType ?? '').toLowerCase();
    const name = (fileName ?? '').toLowerCase();

    if (mime.includes('wordprocessingml') || name.endsWith('.docx')) {
        return 'docx';
    }
    if (
        mime.includes('presentationml') ||
        name.endsWith('.pptx') ||
        name.endsWith('.pptm') ||
        name.endsWith('.ppsx')
    ) {
        return 'pptx';
    }
    if (mime.includes('spreadsheetml') || name.endsWith('.xlsx')) {
        return 'xlsx';
    }
    return null;
}

function detectKindFromZip(zip: JSZip): OfficeOpenXmlKind | null {
    if (
        zipEntry(zip, 'ppt/presentation.xml') ||
        Object.keys(zip.files).some((path) =>
            /^ppt\/slides\/slide\d+\.xml$/i.test(path),
        )
    ) {
        return 'pptx';
    }
    if (zipEntry(zip, 'word/document.xml')) {
        return 'docx';
    }
    if (zipEntry(zip, 'xl/workbook.xml')) {
        return 'xlsx';
    }
    return null;
}

function looksLikeZip(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

async function extractDocxText(zip: JSZip): Promise<string> {
    const doc = zipEntry(zip, 'word/document.xml');
    if (!doc) {
        throw new Error('Invalid DOCX: missing word/document.xml');
    }
    const xml = await doc.async('string');
    // Paragraph breaks; soft line breaks inside runs.
    const withBreaks = xml
        .replace(/<w:tab\b[^>]*\/>/gi, '\t')
        .replace(/<w:br\b[^>]*\/>/gi, '\n')
        .replace(/<\/w:p>/gi, '\n');
    return decodeXmlText(stripXmlTags(withBreaks));
}

async function extractPptxContent(zip: JSZip): Promise<OfficeExtractedContent> {
    const slides = Object.keys(zip.files)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
        .sort((a, b) => slideIndex(a) - slideIndex(b));

    if (!slides.length) {
        throw new Error('Invalid PPTX: no slides found');
    }

    const notesBySlide = await readNotesBySlide(zip);
    const images = await extractPptxImages(zip, slides);
    const imageSlides = new Set(images.map((image) => image.slideIndex));

    const parts: string[] = [];
    for (const path of slides) {
        const file = zip.file(path);
        if (!file) continue;
        const index = slideIndex(path);
        const xml = await file.async('string');
        const text = xmlToSlideText(xml);
        const notes = notesBySlide.get(index);
        if (!text && !notes && !imageSlides.has(index)) {
            continue;
        }
        const body = [text, notes ? `Notes:\n${notes}` : '']
            .filter(Boolean)
            .join('\n');
        parts.push(
            body ? `--- Slide ${index} ---\n${body}` : `--- Slide ${index} ---`,
        );
    }

    return {
        kind: 'pptx',
        text:
            parts.join('\n\n').trim() ||
            `Presentation has ${slides.length} slide(s) but no extractable text or raster images.`,
        images,
    };
}

async function readNotesBySlide(zip: JSZip): Promise<Map<number, string>> {
    const notes = new Map<number, string>();
    const paths = Object.keys(zip.files).filter((path) =>
        /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(path),
    );
    for (const path of paths) {
        const file = zip.file(path);
        if (!file) continue;
        const text = xmlToSlideText(await file.async('string'));
        if (text) {
            notes.set(slideIndex(path), text);
        }
    }
    return notes;
}

async function extractPptxImages(
    zip: JSZip,
    slides: string[],
): Promise<OfficeExtractedImage[]> {
    const images: OfficeExtractedImage[] = [];
    const seen = new Set<string>();

    for (const slidePath of slides) {
        if (images.length >= MAX_PPTX_SLIDE_IMAGES) {
            break;
        }
        const index = slideIndex(slidePath);
        const relsPath = slidePath.replace(
            /^(ppt\/slides\/)(slide\d+\.xml)$/i,
            'ppt/slides/_rels/$2.rels',
        );
        const relsFile = zipEntry(zip, relsPath);
        if (!relsFile) {
            continue;
        }
        const relsXml = await relsFile.async('string');
        const slideDir = posixPath.dirname(slidePath);
        const targets = imageTargetsFromRels(relsXml);

        for (const target of targets) {
            if (images.length >= MAX_PPTX_SLIDE_IMAGES) {
                break;
            }
            const mediaPath = resolveRelTarget(slideDir, target);
            const key = mediaPath.toLowerCase();
            if (seen.has(key)) continue;
            const mime = rasterMimeFromPath(mediaPath);
            if (!mime) continue;
            const media = zipEntry(zip, mediaPath);
            if (!media) continue;
            const buffer = Buffer.from(await media.async('uint8array'));
            if (!isLargeEnoughRaster(buffer)) continue;
            seen.add(key);
            images.push({
                buffer,
                mimeType: mime,
                fileName: posixPath.basename(mediaPath) || `slide-${index}.png`,
                slideIndex: index,
            });
        }
    }

    return images;
}

function imageTargetsFromRels(xml: string): string[] {
    const targets: string[] = [];
    const relRegex = /<Relationship\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = relRegex.exec(xml))) {
        const attrs = match[1] ?? '';
        if (/\bTargetMode\s*=\s*["']External["']/i.test(attrs)) {
            continue;
        }
        const type = attrValue(attrs, 'Type');
        if (!/\/image$/i.test(type)) {
            continue;
        }
        const target = decodeXmlText(attrValue(attrs, 'Target'));
        if (target) {
            targets.push(target);
        }
    }
    return targets;
}

function attrValue(attrs: string, name: string): string {
    const match = attrs.match(
        new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'),
    );
    return match?.[1] ?? '';
}

function resolveRelTarget(relsDir: string, target: string): string {
    const normalized = target.replace(/\\/g, '/');
    if (normalized.startsWith('/')) {
        return normalized.replace(/^\/+/, '');
    }
    return posixPath.normalize(`${relsDir}/${normalized}`).replace(/^\.\//, '');
}

function rasterMimeFromPath(path: string): string | null {
    const ext = posixPath.extname(path).replace('.', '').toLowerCase();
    return RASTER_MIME_BY_EXT[ext] ?? null;
}

function isLargeEnoughRaster(buffer: Buffer): boolean {
    try {
        const size = imageSize(buffer);
        const width = size.width ?? 0;
        const height = size.height ?? 0;
        if (!width || !height) {
            return true;
        }
        return width >= MIN_SLIDE_IMAGE_EDGE || height >= MIN_SLIDE_IMAGE_EDGE;
    } catch {
        return true;
    }
}

function xmlToSlideText(xml: string): string {
    return decodeXmlText(stripXmlTags(xml.replace(/<\/a:p>/gi, '\n')));
}

async function extractXlsxText(zip: JSZip): Promise<string> {
    const sharedStrings = await readSharedStrings(zip);
    const sheetPaths = Object.keys(zip.files)
        .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
        .sort((a, b) => sheetIndex(a) - sheetIndex(b));

    if (!sheetPaths.length) {
        throw new Error('Invalid XLSX: no worksheets found');
    }

    const parts: string[] = [];
    for (const path of sheetPaths) {
        const file = zip.file(path);
        if (!file) continue;
        const xml = await file.async('string');
        const rows = extractSheetRows(xml, sharedStrings);
        if (rows.length) {
            parts.push(`--- Sheet ${sheetIndex(path)} ---\n${rows.join('\n')}`);
        }
    }
    return parts.join('\n\n').trim();
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
    const file = zipEntry(zip, 'xl/sharedStrings.xml');
    if (!file) {
        return [];
    }
    const xml = await file.async('string');
    const items: string[] = [];
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
    let match: RegExpExecArray | null;
    while ((match = siRegex.exec(xml))) {
        const chunk = match[1] ?? '';
        // Shared string can be plain <t> or rich text with multiple <t>.
        const texts = [...chunk.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(
            (m) => decodeXmlText(m[1] ?? ''),
        );
        items.push(texts.join(''));
    }
    return items;
}

function extractSheetRows(xml: string, sharedStrings: string[]): string[] {
    const rows: string[] = [];
    const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(xml))) {
        const rowXml = rowMatch[1] ?? '';
        const cells: string[] = [];
        const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/gi;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(rowXml))) {
            const attrs = cellMatch[1] ?? cellMatch[3] ?? '';
            const body = cellMatch[2] ?? '';
            const typeMatch = attrs.match(/\bt="([^"]+)"/i);
            const type = typeMatch?.[1] ?? '';
            const vMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
            const raw = vMatch?.[1] ?? '';
            if (type === 's') {
                const index = Number(raw);
                cells.push(
                    Number.isFinite(index) ? (sharedStrings[index] ?? '') : '',
                );
            } else if (type === 'inlineStr') {
                const tMatch = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i);
                cells.push(decodeXmlText(tMatch?.[1] ?? ''));
            } else {
                cells.push(decodeXmlText(raw));
            }
        }
        const line = cells.join('\t').trimEnd();
        if (line.trim()) {
            rows.push(line);
        }
    }
    return rows;
}

function zipEntry(zip: JSZip, path: string): JSZip.JSZipObject | null {
    const direct = zip.file(path);
    if (direct) {
        return direct;
    }
    const lower = path.toLowerCase();
    const key = Object.keys(zip.files).find(
        (entry) => entry.toLowerCase() === lower,
    );
    return key ? zip.file(key) : null;
}

function stripXmlTags(xml: string): string {
    return xml.replace(/<[^>]+>/g, ' ');
}

function decodeXmlText(value: string): string {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
        )
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function slideIndex(path: string): number {
    const match = path.match(/slide(\d+)\.xml$/i);
    return match ? Number(match[1]) : 0;
}

function sheetIndex(path: string): number {
    const match = path.match(/sheet(\d+)\.xml$/i);
    return match ? Number(match[1]) : 0;
}
