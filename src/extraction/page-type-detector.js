import { cleanText } from '../utils/normalize.js';
import { isShellPage, isErrorPage } from '../validation/quality-rules.js';

export const PAGE_TYPES = ['listing', 'detail', 'category', 'shell', 'error', 'unknown'];

export function detectPageType(url, rawText, rawHtml, $, sourceType) {
    const pathname = safePathname(url);
    const text = cleanText(rawText);
    const html = rawHtml || '';

    if (isErrorPage(text, html)) {
        return buildResult('error', { hasOffers: false, needsRender: false, reason: 'error_page' });
    }

    const byUrl = detectByUrl(pathname, sourceType);
    if (byUrl) {
        return enrichWithContent(byUrl, text, $, sourceType, pathname);
    }

    if (isShellPage(text, html)) {
        return buildResult('shell', { hasOffers: false, needsRender: true, reason: 'js_shell_or_sparse' });
    }

    if ($ && hasOfferCards($, sourceType)) {
        return buildResult('listing', { hasOffers: true, hasMerchantData: true, needsRender: false });
    }

    if (/offers?$/i.test(text.split('\n')[0] || '') && !/\d+\s*%/.test(text)) {
        return buildResult('category', { hasOffers: false, reason: 'category_header_page' });
    }

    return buildResult('unknown', { hasOffers: /cashback|%\s*off|discount/i.test(text), needsRender: html.length > 8000 && text.length < 600 });
}

function detectByUrl(pathname, sourceType) {
    if (sourceType === 'emiratesNbd') {
        if (/\/deals\/?$/.test(pathname)) return 'listing';
        if (/\/deals\/[^/]+\/[^/]+/.test(pathname)) return 'detail';
    }
    if (sourceType === 'visaUAE') {
        if (/\/visa-offers-and-perks\/?$/.test(pathname)) return 'listing';
        if (/\/visa-offers-and-perks\/.+\/\d+\/?$/i.test(pathname)) return 'detail';
    }
    if (sourceType === 'fab') {
        if (/\/offers?\/?$/.test(pathname)) return 'listing';
    }
    return null;
}

function enrichWithContent(pageType, text, $, sourceType, pathname = '') {
    if (pageType === 'detail' && sourceType === 'visaUAE') {
        const title = cleanText($?.('h1').first().text());
        if (/cards?\s*&\s*rewards?/i.test(title) || /try one of these popular/i.test(text)) {
            return buildResult('category', { hasOffers: false, reason: 'generic_visa_detail_container' });
        }
    }

    if (pageType === 'listing' && sourceType === 'fab') {
        const categoryOnly = /^(?:food|travel|online|entertainment|wellness|fashion|seasonal)\s+(?:&\s+\w+\s+)?offers?$/im.test(text);
        if (categoryOnly && !/\d+\s*%/.test(text)) {
            return buildResult('category', { hasOffers: false, reason: 'fab_category_listing' });
        }
    }

    return buildResult(pageType, {
        hasOffers: pageType === 'listing' || pageType === 'detail',
        hasMerchantData: /\b(at|with)\b/i.test(text) || pageType === 'detail',
        needsRender: false,
    });
}

function hasOfferCards($, sourceType) {
    if (sourceType === 'visaUAE') return $('.vs-card').length > 0;
    if (sourceType === 'emiratesNbd') return $('a[href*="/deals/"][data-ctatext], a.stretched-link[href*="/deals/"]').length > 0;
    if (sourceType === 'fab') return $('[class*="offer"], article, h2').length > 2;
    return $('article, .card, .offer').length > 0;
}

function buildResult(pageType, extra = {}) {
    return { pageType, ...extra };
}

function safePathname(url) {
    try {
        return new URL(url).pathname;
    } catch {
        return '';
    }
}

export function shouldSkipPage(pageInfo) {
    return pageInfo.pageType === 'error' || pageInfo.pageType === 'shell' || pageInfo.pageType === 'category';
}
