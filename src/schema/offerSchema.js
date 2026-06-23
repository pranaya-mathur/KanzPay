/**
 * @file offerSchema.js
 * Single source of truth for KanzPay offer records: shape, validation, and normalization.
 */

import {
    cleanText,
    toNumber,
    findCurrency,
    parseDate,
    uniq,
    isStackable,
    normalizeBankName,
    normalizeCardName,
    normalizeMerchantName,
    normalizeDiscountType,
} from '../utils/normalize.js';

/** @typedef {'emiratesNbd'|'visaUAE'|'fab'|'couponFeed'|'merchant'|'generic'} SourceType */

export const SOURCE_TYPES = [
    'emiratesNbd',
    'visaUAE',
    'fab',
    'couponFeed',
    'merchant',
    'generic',
];

export const DISCOUNT_TYPES = [
    'percent',
    'fixed',
    'cashback',
    'coupon',
    'points',
    'emi',
    'installment',
    'complimentary',
    'other',
];

/** MCC ranges inferred from offer categories (ISO 18245). */
const CATEGORY_MCC_MAP = {
    grocery: ['5411'],
    dining: ['5812', '5814'],
    travel: ['3000', '4511', '7011', '4722'],
    fuel: ['5541', '5542'],
    shopping: ['5311', '5331', '5399'],
    fashion: ['5651', '5691', '5699'],
    electronics: ['5732', '5734'],
    entertainment: ['7832', '7922', '7996'],
    jewelry: ['5944'],
};

const GARBAGE_TITLE_PATTERNS = [
    /^oops!?$/i,
    /^404\b/i,
    /^page not found/i,
    /^error\b/i,
    /^not found$/i,
    /^access denied/i,
    /^login\b/i,
    /^sign in$/i,
    /^choose your website/i,
    /^customer (?:care|support)/i,
];

const FALSE_COUPON_BLOCKLIST = new Set([
    'HTTP', 'HTTPS', 'HTML', 'TRUE', 'FALSE', 'NULL', 'CODE', 'PROMO',
    'CLICK', 'HERE', 'MORE', 'SHOW', 'VIEW', 'SHOP', 'DEAL', 'DEALS',
    'SAVE', 'OFF', 'UAE', 'AED', 'USD', 'THE', 'AND', 'FOR', 'WITH',
]);

const MIN_TITLE_LENGTH = 4;
const MIN_PAGE_LENGTH = 200;
const LOW_CONFIDENCE_THRESHOLD = 0.25;

/**
 * Create a blank offer record with defaults.
 * @param {object} [overrides]
 * @returns {object}
 */
export function createDefaultOffer(overrides = {}) {
    return {
        sourceUrl: null,
        sourceType: 'generic',
        bankName: null,
        cardName: null,
        merchantName: null,
        offerTitle: null,
        offerDescription: null,
        discountType: null,
        discountValue: null,
        currency: 'AED',
        minSpend: null,
        capValue: null,
        validFrom: null,
        validTo: null,
        couponCode: null,
        paymentMethods: [],
        eligibleMccList: [],
        categories: [],
        stackable: false,
        termsUrl: null,
        confidence: 0,
        parserName: null,
        parserVersion: null,
        pageType: null,
        extractionWarnings: [],
        parserReason: null,
        crawlDepth: 0,
        pageLength: 0,
        scrapedAt: new Date().toISOString(),
        rawText: null,
        rawHtml: null,
        discoveryQuery: null,
        discoverySource: null,
        serpRank: null,
        schemaVersion: '1.0',
        ...overrides,
    };
}

/** @deprecated Use createDefaultOffer — kept for parser compatibility. */
export const createOfferBase = ({ sourceUrl, sourceType, parserName, parserReason, crawlDepth = 0 }) =>
    createDefaultOffer({ sourceUrl, sourceType, parserName, parserReason, crawlDepth });

/**
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isGarbageTitle(title) {
    if (!title) return true;
    const t = cleanText(title);
    if (t.length < MIN_TITLE_LENGTH) return true;
    return GARBAGE_TITLE_PATTERNS.some((p) => p.test(t));
}

/**
 * Reject false coupon strings (random uppercase, nav text, etc.).
 * @param {string|null|undefined} code
 * @returns {boolean}
 */
export function isValidCouponCode(code) {
    if (!code) return false;
    const c = cleanText(code).toUpperCase();
    if (c.length < 4 || c.length > 20) return false;
    if (FALSE_COUPON_BLOCKLIST.has(c)) return false;
    if (!/^[A-Z][A-Z0-9_-]{3,19}$/.test(c)) return false;
    // Must contain at least one digit or be 6+ chars (avoids SAVE, DEAL, etc.)
    if (!/\d/.test(c) && c.length < 6) return false;
    return true;
}

/**
 * @param {object|null|undefined} offer
 * @returns {boolean}
 */
export function hasMinimumOfferFields(offer) {
    if (!offer) return false;

    const title = cleanField(offer.offerTitle);
    if (title && title.length >= MIN_TITLE_LENGTH && !isGarbageTitle(title)) {
        return true;
    }
    if (cleanField(offer.discountType)) return true;
    if (isValidCouponCode(offer.couponCode)) return true;
    if (cleanField(offer.merchantName) && cleanField(offer.merchantName).length >= 2) return true;
    if (cleanField(offer.bankName)) return true;

    return false;
}

/**
 * Full quality gate before dataset push.
 * @param {object} offer Normalized offer
 * @param {{ pageLength?: number, rawText?: string }} [ctx]
 * @returns {boolean}
 */
export function passesQualityGate(offer, ctx = {}) {
    if (!hasMinimumOfferFields(offer)) return false;

    if (offer.offerTitle && isGarbageTitle(offer.offerTitle)) return false;

    const pageLength = ctx.pageLength ?? offer.pageLength ?? 0;
    const strongSignals = offer.discountValue > 0
        || isValidCouponCode(offer.couponCode)
        || offer.bankName
        || (offer.discountType && offer.merchantName);
    if (pageLength > 0 && pageLength < MIN_PAGE_LENGTH && !strongSignals) return false;

    if (offer.couponCode && !isValidCouponCode(offer.couponCode)) return false;

    // Reject shell / error pages detected in body
    const body = `${ctx.rawText || ''} ${offer.offerDescription || ''}`;
    if (/can't seem to find the page|page you're looking for|404 not found/i.test(body)
        && !offer.discountValue) {
        return false;
    }

    // Reject zero-value junk: only a bare title with no discount/merchant/bank/code
    const hasValue = offer.discountValue > 0
        || isValidCouponCode(offer.couponCode)
        || offer.bankName
        || offer.cardName
        || (offer.merchantName && offer.discountType);
    const hasMeaningfulTitle = offer.offerTitle
        && !isGarbageTitle(offer.offerTitle)
        && offer.offerTitle.length >= MIN_TITLE_LENGTH;
    if (!hasValue && !hasMeaningfulTitle) return false;

    if (offer.confidence != null && offer.confidence < LOW_CONFIDENCE_THRESHOLD
        && !isValidCouponCode(offer.couponCode)) {
        return false;
    }

    return true;
}

/**
 * @param {object} offer
 * @returns {string}
 */
export function buildDedupeKey(offer) {
    const url = (offer.sourceUrl || '').toLowerCase().split('#')[0].split('?')[0];
    const title = cleanField(offer.offerTitle).toLowerCase();
    const code = cleanField(offer.couponCode).toLowerCase();
    return `${url}::${title}::${code}`;
}

/**
 * Infer MCC codes from offer categories.
 * @param {string[]} categories
 * @returns {string[]}
 */
export function inferMccFromCategories(categories = []) {
    const mccs = new Set();
    for (const cat of categories) {
        const key = String(cat).toLowerCase();
        for (const mcc of CATEGORY_MCC_MAP[key] || []) mccs.add(mcc);
    }
    return [...mccs];
}

/**
 * Normalize a raw parser output into a clean dataset record.
 * Preserves parser-supplied discountType when valid.
 * @param {object} rawData
 * @returns {object}
 */
export function normalizeOffer(rawData) {
    const {
        sourceUrl,
        sourceType,
        offerTitle,
        offerDescription,
        rawText,
        rawHtml,
        parserReason,
        crawlDepth,
        pageLength,
    } = rawData;

    let discountType = normalizeDiscountType(rawData.discountType);
    let discountValue = rawData.discountValue;
    if (discountValue != null && discountType !== 'emi' && discountType !== 'complimentary' && discountType !== 'coupon') {
        discountValue = toNumber(String(discountValue));
    }

    // Only infer discount type when parser did not supply one
    if (!discountType) {
        const combined = `${offerTitle || ''} ${offerDescription || ''}`;
        if (/cashback|cash back/i.test(combined)) discountType = 'cashback';
        else if (/\d+\s*%|%\s*off|up to \d+\s*%/i.test(combined)) discountType = 'percent';
        else if (/AED\s*\d|Dhs\s*\d/i.test(combined)) discountType = 'fixed';
        else if (/points|miles|rewards/i.test(combined)) discountType = 'points';
        else if (/promo code|coupon code|use code/i.test(combined)) discountType = 'coupon';
        else if (/emi|installment|instalment/i.test(combined)) discountType = 'emi';
        else if (/complimentary|free lounge|free flight/i.test(combined)) discountType = 'complimentary';
    }

    const currency = findCurrency(offerTitle)
        || findCurrency(offerDescription)
        || findCurrency(rawText)
        || rawData.currency
        || 'AED';

    let couponCode = rawData.couponCode ? cleanText(rawData.couponCode).toUpperCase() : null;
    if (couponCode && !isValidCouponCode(couponCode)) couponCode = null;

    const categories = uniq(rawData.categories || []);
    const eligibleMccList = uniq([
        ...(rawData.eligibleMccList || []),
        ...inferMccFromCategories(categories),
    ]);

    const stackable = rawData.stackable != null
        ? !!rawData.stackable
        : isStackable(`${offerDescription || ''} ${rawText || ''}`);

    return {
        sourceUrl,
        sourceType,
        bankName: normalizeBankName(rawData.bankName),
        cardName: normalizeCardName(rawData.cardName),
        merchantName: normalizeMerchantName(rawData.merchantName),
        offerTitle: cleanText(offerTitle) || null,
        offerDescription: cleanText(offerDescription) || null,
        discountType,
        discountValue: discountType === 'emi'
            ? (discountValue ? cleanText(String(discountValue)) : null)
            : (discountValue && discountValue > 0 ? discountValue : null),
        currency,
        minSpend: rawData.minSpend != null ? toNumber(String(rawData.minSpend)) : null,
        capValue: rawData.capValue != null ? toNumber(String(rawData.capValue)) : null,
        validFrom: parseDate(rawData.validFrom),
        validTo: parseDate(rawData.validTo),
        couponCode,
        paymentMethods: uniq(rawData.paymentMethods || []).map(normalizePaymentLabel),
        eligibleMccList,
        categories,
        stackable,
        termsUrl: rawData.termsUrl || null,
        confidence: rawData.confidence ?? 0,
        parserName: rawData.parserName,
        parserVersion: rawData.parserVersion || null,
        pageType: rawData.pageType || null,
        extractionWarnings: uniq(rawData.extractionWarnings || []),
        parserReason: parserReason || rawData.parserReason || null,
        crawlDepth: crawlDepth ?? 0,
        pageLength: pageLength ?? (rawText ? rawText.length : 0),
        scrapedAt: new Date().toISOString(),
        rawText: rawData.includeText === false ? undefined : cleanText(rawText),
        rawHtml: rawData.includeHtml ? rawHtml : undefined,
        discoveryQuery: rawData.discoveryQuery || null,
        discoverySource: rawData.discoverySource || null,
        serpRank: rawData.serpRank != null ? Number(rawData.serpRank) : null,
        schemaVersion: rawData.schemaVersion || '1.0',
    };
}

function cleanField(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
}

function normalizePaymentLabel(label) {
    const l = String(label).toLowerCase();
    if (l.includes('emirates nbd') || l === 'enbd') return 'Emirates NBD Card';
    if (l.includes('fab') || l.includes('first abu dhabi')) return 'FAB Card';
    if (l.includes('credit card')) return 'Credit Card';
    if (l.includes('debit card')) return 'Debit Card';
    if (l === 'visa') return 'Visa';
    if (l.includes('mastercard')) return 'Mastercard';
    return label;
}
