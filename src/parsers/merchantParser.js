import { createOfferBase } from '../schema/offerSchema.js';
import {
    extractMatch, PATTERNS, detectCategories, detectDiscountType, extractPaymentMethods,
} from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';

export function matchMerchant(url, sourceTypeHint) {
    if (sourceTypeHint === 'merchant') return true;
    // Merchant pages on non-bank domains with offer-like paths
    const lower = url.toLowerCase();
    if (/emiratesnbd|bankfab|visa\.co\.ae/i.test(lower)) return false;
    return /\/promo|\/offer|\/deal|\/bank-offer|\/card-offer/i.test(lower);
}

export function parseMerchant($, url, rawText, rawHtml, meta = {}) {
    const reason = `merchant; path=${new URL(url).pathname}`;
    const offers = [];

    const title = cleanText($?.('h1, h2.promo-title, .offer-title').first().text())
        || cleanText($?.('meta[property="og:title"]').attr('content'))
        || cleanText($?.('title').text());
    const description = cleanText($?.('.promo-desc, .offer-description, .terms, article').text())
        || cleanText($?.('p').map((_, el) => $(el).text()).get().join(' ').slice(0, 2000));
    const merchantName = cleanText($?.('meta[property="og:site_name"]').attr('content'))
        || extractMatch(title, /^([A-Za-z0-9&'\s.-]{2,30})\s+(?:offer|promo|deal)/i);

    if (title && title.length > 4) {
        offers.push(buildMerchantOffer({
            url,
            title,
            description,
            merchantName,
            rawText,
            meta,
            reason: `${reason}; mode=detail`,
        }));
    }

    return offers;
}

function buildMerchantOffer({ url, title, description, merchantName, rawText, meta, reason }) {
    const offer = createOfferBase({
        sourceUrl: url,
        sourceType: 'merchant',
        parserName: 'merchantParser',
        parserReason: reason,
        crawlDepth: meta.crawlDepth,
    });

    const combined = `${title} ${description} ${rawText}`;
    const { discountType, discountValue } = detectDiscountType(combined);

    // Detect bank/card restrictions
    let bankName = null;
    let cardName = null;
    if (/emirates\s*nbd|enbd/i.test(combined)) bankName = 'Emirates NBD';
    if (/\bfab\b|first\s+abu\s+dhabi/i.test(combined)) bankName = 'First Abu Dhabi Bank';
    if (/\bvisa\b/i.test(combined)) cardName = 'Visa';
    if (/\bmastercard\b/i.test(combined)) cardName = 'Mastercard';

    offer.merchantName = merchantName;
    offer.bankName = bankName;
    offer.cardName = cardName;
    offer.offerTitle = title;
    offer.offerDescription = description;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.minSpend = toNum(extractMatch(rawText, PATTERNS.minSpend));
    offer.capValue = toNum(extractMatch(rawText, PATTERNS.cap));
    offer.couponCode = extractMatch(rawText, PATTERNS.couponCode);
    offer.validTo = extractMatch(rawText, PATTERNS.validity);
    offer.paymentMethods = extractPaymentMethods(rawText);
    offer.categories = detectCategories(combined);
    offer.stackable = /not combinable|cannot be combined/i.test(combined) ? false : undefined;
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
