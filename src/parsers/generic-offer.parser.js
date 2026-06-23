/**
 * Generic fallback parser — JSON-LD, meta tags, stable DOM; returns no_offer on shells.
 */
import { createOfferBase } from '../schema/offerSchema.js';
import {
    detectCategories, detectDiscountType, extractMatch, extractPaymentMethods, PATTERNS,
} from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';
import { PARSER_VERSION } from '../sources/source-registry.js';
import { extractJsonLd, extractMetaTags, offersFromJsonLd } from '../extraction/structured-data-extractor.js';
import { isCategoryHeaderTitle, isShellPage } from '../validation/quality-rules.js';

export function parseGenericOffer($, url, rawText, rawHtml, meta = {}) {
    const reason = `fallback-generic; path=${new URL(url).pathname}`;
    const warnings = [];

    if (isShellPage(rawText, rawHtml)) {
        return { offers: [], warnings: ['no_offer:shell_page'], pageOutcome: 'no_offer' };
    }

    const jsonLdOffers = offersFromJsonLd(extractJsonLd($));
    if (jsonLdOffers.length) {
        return {
            offers: jsonLdOffers.map((j) => buildFromStructured(url, j, rawText, meta, `${reason}; json-ld`)),
            warnings: ['json_ld_extracted'],
        };
    }

    const metaTags = extractMetaTags($);
    const title = cleanText($?.('h1').first().text()) || metaTags.title;
    const description = cleanText($?.('article, main, .content').first().text())
        || metaTags.description
        || cleanText($?.('p').first().text());

    if (title && isCategoryHeaderTitle(title)) {
        return { offers: [], warnings: ['no_offer:category_page'], pageOutcome: 'no_offer' };
    }

    const combined = `${title} ${description} ${rawText}`;
    const hasOfferSignal = /(?:cashback|%\s*off|AED\s*\d|promo\s*code|valid\s+until|minimum\s+spend|discount|coupon)/i.test(combined);

    if (title && title.length > 4 && hasOfferSignal && !/oops|not found|login/i.test(title)) {
        return {
            offers: [buildGenericOffer({ url, title, description, rawText, meta, reason })],
            warnings,
        };
    }

    return { offers: [], warnings: ['no_offer:no_signals'], pageOutcome: 'no_offer' };
}

function buildFromStructured(url, j, rawText, meta, reason) {
    const offer = buildGenericOffer({
        url,
        title: j.offerTitle,
        description: j.offerDescription,
        rawText,
        meta,
        reason,
    });
    if (j.merchantName) offer.merchantName = j.merchantName;
    if (j.validTo) offer.validTo = j.validTo;
    return offer;
}

function buildGenericOffer({ url, title, description, rawText, meta, reason }) {
    const offer = createOfferBase({
        sourceUrl: url,
        sourceType: 'generic',
        parserName: 'genericOfferParser',
        parserReason: reason,
        crawlDepth: meta.crawlDepth,
    });

    const { discountType, discountValue } = detectDiscountType(`${title} ${description} ${rawText}`);

    offer.offerTitle = title;
    offer.offerDescription = description;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.merchantName = extractMatch(title, /(?:at|with|from)\s+([A-Za-z0-9&'\s.-]{2,40})/i);
    offer.couponCode = extractMatch(rawText, PATTERNS.couponCode);
    offer.minSpend = extractMatch(rawText, PATTERNS.minSpend);
    offer.capValue = extractMatch(rawText, PATTERNS.cap);
    offer.validTo = extractMatch(rawText, PATTERNS.validity);
    offer.paymentMethods = extractPaymentMethods(rawText);
    offer.categories = detectCategories(`${title} ${description}`);
    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, rawText) * 0.7;
    offer.rawText = rawText;
    offer.parserVersion = PARSER_VERSION;
    offer.pageType = meta.pageType || 'unknown';
    return offer;
}
