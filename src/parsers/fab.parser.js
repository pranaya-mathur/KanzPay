/**
 * FAB parser v2 — separates category headers from merchant offers.
 */
import { createOfferBase } from '../schema/offerSchema.js';
import {
    extractMatch, PATTERNS, detectCategories, detectDiscountType, extractPaymentMethods,
} from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';
import { PARSER_VERSION } from '../sources/source-registry.js';
import { isCategoryHeaderTitle, isCookieOrPrivacyNoise, isNonUaeFabOffer } from '../validation/quality-rules.js';

export function matchFab(url) {
    return /bankfab\.com/i.test(url);
}

export function parseFab($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=bankfab.com; path=${new URL(url).pathname}`;
    const warnings = [];
    const offers = [];
    const isListing = /\/credit-cards\/offers(?:\/[^/]+)?\/?$/i.test(url)
        || (/\/offers?\/?$|\/rewards?\/?$|\/promotions?\/?$/i.test(url) && /bankfab\.com/i.test(url));
    const isDetail = /\/credit-cards\/offers\/[^/]+\/[^/]+/i.test(url);

    if (isListing && $) {
        const seen = new Set();
        $('a[href*="/credit-cards/offers/"]').each((_, el) => {
            const link = $(el);
            const href = link.attr('href');
            if (!href || /\/offers\/?$/.test(href)) return;
            const absUrl = href.startsWith('http') ? href : new URL(href, url).href;
            const title = cleanText(link.text()) || cleanText(link.find('h2, h3').text());
            if (!title || title.length < 3) return;
            if (isCategoryHeaderTitle(title, 'fab')) return;
            if (isNonUaeFabOffer(title, absUrl)) return;
            const key = `${absUrl}::${title}`;
            if (seen.has(key)) return;
            seen.add(key);
            offers.push(buildFabOffer({
                url: absUrl,
                title,
                description: '',
                rawText: title,
                meta,
                reason: `${reason}; mode=offer-link`,
            }));
        });

        $('h2, h3, .offer, .card, .promo-card, article, li, a[href*="offer"]').each((_, el) => {
            const card = $(el);
            const link = card.is('a') ? card : card.find('a').first();
            const href = link.attr('href');
            const title = cleanText(card.find('h2, h3, .title').first().text()) || cleanText(link.text()) || cleanText(card.text()).split('\n')[0];
            if (!title || title.length < 5) return;
            if (isCategoryHeaderTitle(title, 'fab')) {
                warnings.push(`category_header_skipped:${title}`);
                return;
            }
            if (!hasMerchantOrDiscountSignal(card.text(), title)) return;
            if (isCookieOrPrivacyNoise(`${title} ${card.text()}`)) return;
            const absUrl = href ? (href.startsWith('http') ? href : new URL(href, url).href) : url;
            if (isNonUaeFabOffer(`${title} ${card.text()}`, absUrl)) {
                warnings.push(`non_uae_skipped:${title.slice(0, 30)}`);
                return;
            }

            const key = `${absUrl}::${title}`;
            if (seen.has(key)) return;
            seen.add(key);

            offers.push(buildFabOffer({
                url: absUrl,
                title,
                description: cleanText(card.find('p').text()),
                rawText: cleanText(card.text()) || rawText,
                meta,
                reason: `${reason}; mode=listing`,
            }));
        });
    }

    if (offers.length === 0 && $) {
        const title = cleanText($('h1, .offer-title').first().text()) || cleanText($('title').text());
        const description = cleanText($('.offer-details, .content, article').text())
            || cleanText($('p').text());

        if (title && title.length > 4
            && !/oops|not found/i.test(title)
            && !isCategoryHeaderTitle(title, 'fab')
            && !isNonUaeFabOffer(`${title} ${description} ${rawText}`, url)
            && hasMerchantOrDiscountSignal(`${title} ${description} ${rawText}`, title)
            && !isCookieOrPrivacyNoise(`${title} ${description} ${rawText}`)) {
            offers.push(buildFabOffer({
                url,
                title,
                description,
                rawText,
                meta,
                reason: `${reason}; mode=${isDetail ? 'detail' : 'detail-fallback'}`,
            }));
        } else if (title && isCategoryHeaderTitle(title, 'fab')) {
            warnings.push('category_detail_skipped');
        }
    }

    return {
        offers: offers.map((o) => ({
            ...o,
            parserName: 'fabParser',
            parserVersion: PARSER_VERSION,
            pageType: meta.pageType || (isListing ? 'listing' : 'detail'),
        })),
        warnings,
    };
}

function hasMerchantOrDiscountSignal(text, title) {
    const combined = `${title} ${text}`;
    // Must have a real benefit signal — removed the title.length > 20 loophole
    // that was accepting merchant-name-only rows with no discount information.
    if (/\d+\s*%|cashback|AED\s*\d|complimentary|lounge|discount|free\s+\w+|save|bonus|reward/i.test(combined)) return true;
    // "at/with/from <Merchant>" in title AND some numeric context in the body text
    if (/(?:at|with|from)\s+[A-Za-z]/i.test(title) && /\d/.test(text)) return true;
    return false;
}

function buildFabOffer({ url, title, description, rawText, meta, reason }) {
    const offer = createOfferBase({
        sourceUrl: url,
        sourceType: 'fab',
        parserName: 'fabParser',
        parserReason: reason,
        crawlDepth: meta.crawlDepth,
    });

    const combined = `${title} ${description} ${rawText}`;
    let { discountType, discountValue } = detectDiscountType(combined);
    const slugHints = extractFabFromSlug(url);
    if ((!discountValue || Number(discountValue) <= 1) && slugHints.discountValue) {
        discountType = slugHints.discountType || discountType;
        discountValue = slugHints.discountValue;
    }

    offer.bankName = 'First Abu Dhabi Bank';
    offer.merchantName = slugHints.merchant
        || extractMatch(title, /(?:at|with|from)\s+([A-Za-z0-9&'\s.-]{2,40})/i)
        || (isCategoryHeaderTitle(title, 'fab') ? null : title);
    offer.offerTitle = title;
    offer.offerDescription = description;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.minSpend = toNum(extractMatch(rawText, PATTERNS.minSpend) || extractMatch(rawText, PATTERNS.minMonthlySpend));
    offer.capValue = toNum(extractMatch(rawText, PATTERNS.cap));
    offer.validTo = extractMatch(rawText, PATTERNS.validityShort)
        || extractMatch(rawText, PATTERNS.validity)
        || extractFabYearEnd(rawText);
    offer.couponCode = extractMatch(rawText, PATTERNS.couponCode);
    offer.paymentMethods = extractPaymentMethods(rawText);
    if (!offer.paymentMethods.length) offer.paymentMethods = ['FAB Card'];

    if (PATTERNS.lounge.test(combined)) {
        offer.categories = [...detectCategories(combined), 'travel'];
    } else {
        offer.categories = detectCategories(combined);
    }

    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, rawText);
    offer.rawText = rawText;
    return offer;
}

function toNum(v) {
    if (!v) return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

function extractFabYearEnd(text) {
    const m = text.match(/(?:valid\s+until|year\s+of)\s*(\d{4})/i);
    if (m) return `${m[1]}-12-31`;
    return null;
}

function extractFabFromSlug(url) {
    let pathname;
    try {
        pathname = new URL(url).pathname;
    } catch {
        return {};
    }
    const slug = pathname.split('/').filter(Boolean).pop() || '';
    const hints = {};
    const pctMatch = slug.match(/(\d{1,2})-percent-off/i)
        || slug.match(/-(\d{1,2})-off/i)
        || slug.match(/discount-(\d{1,2})/i);
    if (pctMatch) {
        hints.discountType = 'percent';
        hints.discountValue = Number(pctMatch[1]);
    }
    const merchantSegment = slug
        .replace(/-discount.*$/i, '')
        .replace(/-\d+$/i, '')
        .split('-')
        .filter((p) => p.length > 2 && !/^(off|fab|uae|offer)$/i.test(p));
    if (merchantSegment.length) {
        hints.merchant = merchantSegment
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }
    return hints;
}
