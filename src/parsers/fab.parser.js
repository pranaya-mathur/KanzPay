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
import { isCategoryHeaderTitle } from '../validation/quality-rules.js';

export function matchFab(url) {
    return /bankfab\.com/i.test(url);
}

export function parseFab($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=bankfab.com; path=${new URL(url).pathname}`;
    const warnings = [];
    const offers = [];
    const isListing = /\/offers?\/?$|\/rewards?\/?$|\/promotions?\/?$/i.test(url);

    if (isListing && $) {
        const seen = new Set();
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

            const absUrl = href ? (href.startsWith('http') ? href : new URL(href, url).href) : url;
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
            && hasMerchantOrDiscountSignal(`${title} ${description} ${rawText}`, title)) {
            offers.push(buildFabOffer({
                url,
                title,
                description,
                rawText,
                meta,
                reason: `${reason}; mode=detail`,
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
    const { discountType, discountValue } = detectDiscountType(combined);

    offer.bankName = 'First Abu Dhabi Bank';
    offer.merchantName = extractMatch(title, /(?:at|with|from)\s+([A-Za-z0-9&'\s.-]{2,40})/i)
        || (isCategoryHeaderTitle(title, 'fab') ? null : title);
    offer.offerTitle = title;
    offer.offerDescription = description;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.minSpend = toNum(extractMatch(rawText, PATTERNS.minSpend) || extractMatch(rawText, PATTERNS.minMonthlySpend));
    offer.capValue = toNum(extractMatch(rawText, PATTERNS.cap));
    offer.validTo = extractMatch(rawText, PATTERNS.validity);
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
