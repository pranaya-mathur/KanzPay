/**
 * Shared helpers for dedicated UAE bank parsers.
 */
import { createDefaultOffer, isValidCouponCode } from '../schema/offerSchema.js';
import {
    extractMatch, PATTERNS, detectCategories, detectDiscountType, extractPaymentMethods,
} from '../utils/extractPatterns.js';
import { cleanText, parseDate } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';
import { PARSER_VERSION } from '../sources/source-registry.js';
import { isCategoryHeaderTitle } from '../validation/quality-rules.js';

export const BANK_META = {
    adcb: { bankName: 'ADCB', sourceType: 'adcb' },
    mashreq: { bankName: 'Mashreq', sourceType: 'mashreq' },
    rakBank: { bankName: 'RAK Bank', sourceType: 'rakBank' },
    dib: { bankName: 'Dubai Islamic Bank', sourceType: 'dib' },
    hsbc: { bankName: 'HSBC', sourceType: 'hsbc' },
    citibank: { bankName: 'Citibank', sourceType: 'citibank' },
    cbd: { bankName: 'CBD', sourceType: 'cbd' },
    adib: { bankName: 'ADIB', sourceType: 'adib' },
    scb: { bankName: 'Standard Chartered', sourceType: 'scb' },
    fab: { bankName: 'First Abu Dhabi Bank', sourceType: 'fab' },
};

export const CARD_SELECTORS = [
    '.offer-card', '.promo-card', '.deal-card', '.promotion-item',
    '.card-offer', 'article.offer', 'li.offer', 'li.deal',
    '[class*="offer-item"]', '[class*="promo-item"]',
    '.offer', '.promotion', '.deal',
].join(', ');

export const TITLE_SELECTORS = 'h1, h2, h3, .offer-title, .promo-title, .card-title, .deal-title, [class*="title"]';
export const MERCHANT_SELECTORS = '.merchant-name, .brand-name, .store-name, .partner-name, [class*="merchant"], [class*="brand"]';
export const DESCRIPTION_SELECTORS = '.offer-description, .promo-description, .deal-desc, .offer-body, .terms, p';

export function buildStandardBankOffer({
    url, title, merchant, description, rawText, meta, bankMeta, parserName, reason, extraCategories = [],
}) {
    const offer = createDefaultOffer({
        sourceUrl: url,
        sourceType: bankMeta.sourceType,
        parserName,
        parserVersion: PARSER_VERSION,
        parserReason: reason,
        crawlDepth: meta.crawlDepth ?? 0,
    });

    const combined = `${title} ${description} ${rawText}`;
    const { discountType, discountValue } = detectDiscountType(combined);

    offer.bankName = bankMeta.bankName || null;
    offer.cardName = inferCardName(combined);
    offer.merchantName = merchant || null;
    offer.offerTitle = title;
    offer.offerDescription = description || null;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.currency = 'AED';
    offer.minSpend = toNum(extractMatch(combined, PATTERNS.minSpend));
    offer.capValue = toNum(extractMatch(combined, PATTERNS.cap));
    offer.validFrom = parseDate(extractMatch(combined, PATTERNS.validity));
    offer.validTo = parseDate(extractMatch(combined, PATTERNS.validityShort))
        || parseDate(extractMatch(combined, PATTERNS.validity));
    offer.couponCode = sanitizeCode(extractMatch(combined, PATTERNS.couponCode));
    offer.paymentMethods = extractPaymentMethods(combined);
    offer.categories = [...new Set([...detectCategories(combined), ...extraCategories])];
    offer.stackable = /not combinable|cannot be combined|not.*stack/i.test(combined) ? false
        : /can be combined|stackable/i.test(combined) ? true : false;
    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, rawText);
    offer.rawText = rawText;

    return offer;
}

export function isListingPage(url, $) {
    if (/\/(?:special-)?offers?\/?$|\/promotions?\/?$|\/deals?\/?$|\/rewards?\/?$|\/perks?\/?$/i.test(url)) return true;
    if (/\/neo\/offers\/?$/i.test(url)) return true;
    if (/offers\.aspx/i.test(url)) return true;
    if ($) {
        const cardCount = $(CARD_SELECTORS).length;
        if (cardCount >= 2) return true;
    }
    return false;
}

export function hasOfferSignal(text, title) {
    const combined = `${title} ${text}`;
    return /cashback|%\s*off|AED\s*\d|\d+\s*%|promo\s*code|valid\s+until|minimum\s+spend|discount|coupon|save|reward|complimentary|instalment|installment|know more|flexi|welcome bonus|miles|lounge/i.test(combined);
}

export function inferMerchantFromTitle(title) {
    if (!title) return null;
    const byMatch = title.match(/^By\s+(.+?)(?:\s*[-–|]|$)/i);
    if (byMatch) return cleanText(byMatch[1]);
    const atMatch = title.match(/(?:at|with|from|for)\s+([A-Za-z0-9&'.\s-]{2,40})/i);
    return atMatch ? cleanText(atMatch[1]) : null;
}

export function inferCardName(text) {
    if (/visa\s+infinite/i.test(text)) return 'Visa Infinite';
    if (/visa\s+signature/i.test(text)) return 'Visa Signature';
    if (/visa\s+platinum/i.test(text)) return 'Visa Platinum';
    if (/\bvisa\b/i.test(text)) return 'Visa';
    if (/world\s+elite/i.test(text)) return 'World Elite Mastercard';
    if (/mastercard/i.test(text)) return 'Mastercard';
    return null;
}

export function sanitizeCode(code) {
    if (!code) return null;
    const c = cleanText(code).toUpperCase();
    return isValidCouponCode(c) ? c : null;
}

export function toNum(v) {
    if (!v) return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

export function safeResolve(href, base) {
    if (!href) return null;
    if (href.startsWith('http')) return href;
    try { return new URL(href, base).href; } catch { return null; }
}

export function safePathname(url) {
    try { return new URL(url).pathname; } catch { return url; }
}

export function wrapParserResult(offers, warnings = [], parserName) {
    return {
        offers: offers.map((o) => ({ ...o, parserName, parserVersion: PARSER_VERSION })),
        warnings,
    };
}
