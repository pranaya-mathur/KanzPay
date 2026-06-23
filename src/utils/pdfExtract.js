/**
 * Extract plain text from a PDF buffer (public PDFs only).
 * Uses lightweight regex extraction — no native PDF deps required.
 */
export function extractTextFromPdfBuffer(buffer) {
    if (!buffer || buffer.length === 0) return '';

    const raw = buffer.toString('latin1');

    // Pull text between stream markers (works for many simple PDFs)
    const streamMatches = raw.match(/stream[\r\n]+([\s\S]*?)endstream/g) || [];
    let text = '';

    for (const block of streamMatches) {
        const inner = block.replace(/^stream[\r\n]+/, '').replace(/endstream$/, '');
        // BT ... ET text blocks
        const tjMatches = inner.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g) || [];
        for (const m of tjMatches) {
            const innerText = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '')
                .replace(/\\\(/g, '(')
                .replace(/\\\)/g, ')');
            text += `${innerText} `;
        }
    }

    return text.replace(/\s+/g, ' ').trim();
}

export function isPdfUrl(url) {
    return /\.pdf(\?|$)/i.test(url || '');
}
