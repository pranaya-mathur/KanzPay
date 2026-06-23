export function extractBodyText($, page) {
    if (page) return null;
    if (!$) return '';
    return ($('body').text() || '').replace(/\s+/g, ' ').trim();
}

export async function extractFromPlaywright(page) {
    const rawText = await page.evaluate(() => document.body?.innerText || '');
    const rawHtml = await page.content();
    return { rawText, rawHtml };
}
