/**
 * Document type helpers for chat providers.
 *
 * OpenAI Responses `input_file`: PDF, Office (doc/docx, ppt/pptx, xls/xlsx),
 * RTF/ODT, CSV/TSV (spreadsheet augmentation).
 *
 * OpenRouter chat `type: "file"` (Claude): PDF, DOCX, XLSX, PPTX.
 * Legacy .doc/.ppt/.xls and RTF/ODT are not in OpenRouter's allowlist.
 */

export type DocumentFileLike = {
    mimeType?: string | null;
    fileName?: string | null;
    buffer?: Buffer;
};

const EXT_MIME: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    html: 'text/html',
    htm: 'text/html',
    log: 'text/plain',
};

function extOf(fileName: string | null | undefined): string {
    const match = (fileName ?? '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] ?? '';
}

export function guessDocumentMime(
    fileName: string | null | undefined,
    mimeHint?: string | null,
): string {
    const hint = (mimeHint ?? '').toLowerCase().trim();
    if (
        hint &&
        hint !== 'application/octet-stream' &&
        hint !== 'binary/octet-stream'
    ) {
        return hint;
    }
    return EXT_MIME[extOf(fileName)] ?? 'application/octet-stream';
}

export function fallbackDocumentName(file: DocumentFileLike): string {
    const mime = (file.mimeType ?? '').toLowerCase();
    const ext = extOf(file.fileName);
    if (mime.includes('pdf') || ext === 'pdf') return 'document.pdf';
    if (mime.includes('wordprocessingml') || mime.includes('msword')) {
        return ext === 'doc' ? 'document.doc' : 'document.docx';
    }
    if (mime.includes('presentationml') || mime.includes('powerpoint')) {
        return ext === 'ppt' ? 'document.ppt' : 'document.pptx';
    }
    if (mime.includes('spreadsheetml') || mime.includes('excel')) {
        return ext === 'xls' ? 'document.xls' : 'document.xlsx';
    }
    if (mime.includes('csv') || ext === 'csv') return 'document.csv';
    if (mime.includes('tab-separated') || ext === 'tsv') return 'document.tsv';
    if (mime.includes('rtf') || ext === 'rtf') return 'document.rtf';
    if (mime.includes('opendocument.text') || ext === 'odt') {
        return 'document.odt';
    }
    return ext ? `document.${ext}` : 'document.bin';
}

export function isPdfDocument(file: DocumentFileLike): boolean {
    const mime = (file.mimeType ?? '').toLowerCase();
    const name = (file.fileName ?? '').toLowerCase();
    if (mime === 'application/pdf' || mime === 'application/x-pdf') {
        return true;
    }
    if (name.endsWith('.pdf')) {
        return true;
    }
    // Telegram sometimes sends PDFs as octet-stream; detect %PDF magic.
    return file.buffer?.subarray(0, 4).toString('ascii') === '%PDF';
}

/** OpenRouter Files / chat file parts: PDF + modern Office only. */
export function isOpenRouterBinaryDocument(file: DocumentFileLike): boolean {
    if (isPdfDocument(file)) {
        return true;
    }
    const mime = (file.mimeType ?? '').toLowerCase();
    const name = (file.fileName ?? '').toLowerCase();
    if (
        mime ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mime ===
            'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mime ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
        return true;
    }
    return /\.(docx|pptx|xlsx)$/i.test(name);
}

/**
 * OpenAI Responses `input_file` path: PDF, Office (incl. legacy), RTF/ODT,
 * CSV/TSV. Prefer this over UTF-8 inlining so spreadsheets get augmentation.
 */
export function isOpenAiBinaryDocument(file: DocumentFileLike): boolean {
    if (isPdfDocument(file)) {
        return true;
    }
    const mime = (file.mimeType ?? '').toLowerCase();
    const name = (file.fileName ?? '').toLowerCase();

    if (
        mime.includes('officedocument') ||
        mime.includes('msword') ||
        mime.includes('ms-excel') ||
        mime.includes('ms-powerpoint') ||
        mime === 'application/rtf' ||
        mime === 'text/rtf' ||
        mime === 'application/vnd.oasis.opendocument.text' ||
        mime === 'text/csv' ||
        mime === 'application/csv' ||
        mime === 'text/tab-separated-values' ||
        mime === 'text/tsv'
    ) {
        return true;
    }

    return /\.(docx?|pptx?|xlsx?|rtf|odt|csv|tsv)$/i.test(name);
}

/** UTF-8 text suitable for inlining into the prompt. */
export function isPlainTextDocument(file: DocumentFileLike): boolean {
    const mime = (file.mimeType ?? '').toLowerCase();
    const name = (file.fileName ?? '').toLowerCase();
    if (mime === 'application/rtf' || mime === 'text/rtf') {
        return false;
    }
    if (
        mime.startsWith('text/') ||
        mime === 'application/json' ||
        mime === 'application/xml' ||
        mime === 'application/csv'
    ) {
        return true;
    }
    return /\.(txt|md|csv|tsv|json|xml|html?|log)$/i.test(name);
}
