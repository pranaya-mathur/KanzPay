import { createOfferBase } from '../schema/offerSchema.js';
import {
    detectCategories, detectDiscountType, extractMatch, extractPaymentMethods, PATTERNS,
} from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';

/**
 * Fallback parser when no source-specific parser matches.
 */
export function parseGeneric($, url, rawText, rawHtml, meta = {}) {
    const reason = `fallback-generic; path=${new URL(url).pathname}`;
    const offers = [];

    const title = cleanText($?.('h1').first().text())
        || cleanText($?.('meta[property="og:title"]').attr('content'))
        || cleanText($?.('title').text());
    const description = cleanText($?.('article, main, .content').first().text())
        || cleanText($?.('p').first().text());

    // Only emit if page has offer-like signals
    const combined = `${title} ${description} ${rawText}`;
    const hasOfferSignal = /(?:cashback|%\s*off|AED\s*\d|promo\s*code|valid\s+until|minimum\s+spend|discount|coupon)/i.test(combined);

    if (title && title.length > 4 && hasOfferSignal && !/oops|not found|login/i.test(title)) {
        offers.push(buildGenericOffer({ url, title, description, rawText, meta, reason }));
    }

    return offers;
}

function buildGenericOffer({ url, title, description, rawText, meta, reason }) {
    const offer = createOfferBase({
        sourceUrl: url,
        sourceType: 'generic',
        parserName: 'genericParser',
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
    offer.confidence = scoreConfidence(offer, rawText) * 0.7; // lower confidence for generic
    offer.rawText = rawText;
    return offer;
}
