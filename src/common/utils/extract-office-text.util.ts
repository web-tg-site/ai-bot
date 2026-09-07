import JSZip from 'jszip';

export type OfficeOpenXmlKind = 'docx' | 'pptx' | 'xlsx';

/**
 * Extract plain text from modern Office Open XML files (docx/pptx/xlsx).
 * Used for Claude via OpenRouter: sending Office as `type: "file"` + file-parser
 * often hangs/times out; local extraction is fast and reliable.
 */
export async function extractOfficeText(
    buffer: Buffer,
    fileName?: string | null,
    mimeType?: string | null,
): Promise<string | null> {
    const kind = detectOfficeOpenXmlKind(fileName, mimeType);
    if (!kind) {
        return null;
    }

    const zip = await JSZip.loadAsync(buffer);
    switch (kind) {
        case 'docx':
            return extractDocxText(zip);
        case 'pptx':
            return extractPptxText(zip);
        case 'xlsx':
            return extractXlsxText(zip);
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

    if (
        mime.includes('wordprocessingml') ||
        name.endsWith('.docx')
    ) {
        return 'docx';
    }
    if (
        mime.includes('presentationml') ||
        name.endsWith('.pptx')
    ) {
        return 'pptx';
    }
    if (
        mime.includes('spreadsheetml') ||
        name.endsWith('.xlsx')
    ) {
        return 'xlsx';
    }
    return null;
}

async function extractDocxText(zip: JSZip): Promise<string> {
    const doc = zip.file('word/document.xml');
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

async function extractPptxText(zip: JSZip): Promise<string> {
    const slides = Object.keys(zip.files)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
        .sort((a, b) => slideIndex(a) - slideIndex(b));

    if (!slides.length) {
        throw new Error('Invalid PPTX: no slides found');
    }

    const parts: string[] = [];
    for (const path of slides) {
        const file = zip.file(path);
        if (!file) continue;
        const xml = await file.async('string');
        const text = decodeXmlText(
            stripXmlTags(xml.replace(/<\/a:p>/gi, '\n')),
        );
        if (text) {
            parts.push(`--- Slide ${slideIndex(path)} ---\n${text}`);
        }
    }
    return parts.join('\n\n').trim();
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
            parts.push(
                `--- Sheet ${sheetIndex(path)} ---\n${rows.join('\n')}`,
            );
        }
    }
    return parts.join('\n\n').trim();
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
    const file = zip.file('xl/sharedStrings.xml');
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
                    Number.isFinite(index)
                        ? (sharedStrings[index] ?? '')
                        : '',
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
        .replace(/&#(\d+);/g, (_, code) =>
            String.fromCharCode(Number(code)),
        )
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
