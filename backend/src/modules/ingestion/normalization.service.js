import {
    cleanText, toNumber, parseDate, uniq, normalizeBankName, normalizeCardName,
    normalizeMerchantName, normalizeDiscountType, inferCategoriesFromText, inferMccFromCategories,
    normalizeCurrency,
} from '../../shared/utils/text-normalize.js';
import { normalizeUrl } from '../../shared/utils/url-normalize.js';
import { mapSourceTypeFromUrl } from '../../shared/schemas/source.schema.js';

const FALSE_COUPON_BLOCKLIST = new Set([
    'HTTP', 'HTTPS', 'HTML', 'TRUE', 'FALSE', 'NULL', 'CODE', 'PROMO',
    'CLICK', 'HERE', 'MORE', 'SHOW', 'VIEW', 'SHOP', 'DEAL', 'DEALS',
    'SAVE', 'OFF', 'UAE', 'AED', 'USD', 'THE', 'AND', 'FOR', 'WITH',
]);

export function isValidCouponCode(code) {
    if (!code) return false;
    const c = cleanText(code).toUpperCase();
    if (c.length < 4 || c.length > 20) return false;
    if (FALSE_COUPON_BLOCKLIST.has(c)) return false;
    if (!/^[A-Z][A-Z0-9_-]{3,19}$/.test(c)) return false;
    if (!/\d/.test(c) && c.length < 6) return false;
    return true;
}

export function normalizeRawOffer(raw) {
    const sourceUrl = raw.sourceUrl;
    const normalizedUrl = normalizeUrl(sourceUrl);
    const sourceType = raw.sourceType || mapSourceTypeFromUrl(sourceUrl);

    let discountType = normalizeDiscountType(raw.discountType);
    let discountValue = raw.discountValue;

    if (discountValue != null && discountType !== 'emi' && discountType !== 'complimentary' && discountType !== 'coupon') {
        discountValue = toNumber(String(discountValue));
    }

    if (!discountType) {
        const combined = `${raw.offerTitle || ''} ${raw.offerDescription || ''}`;
        if (/cashback|cash back/i.test(combined)) discountType = 'cashback';
        else if (/\d+\s*%|%\s*off|up to \d+\s*%/i.test(combined)) discountType = 'percent';
        else if (/AED\s*\d|Dhs\s*\d/i.test(combined)) discountType = 'fixed';
        else if (/points|miles|rewards/i.test(combined)) discountType = 'points';
        else if (/promo code|coupon code|use code/i.test(combined)) discountType = 'coupon';
        else if (/emi|installment|instalment/i.test(combined)) discountType = 'emi';
        else if (/complimentary|free lounge|free flight/i.test(combined)) discountType = 'complimentary';
    }

    const combinedText = `${raw.offerTitle || ''} ${raw.offerDescription || ''} ${raw.rawText || ''}`;
    let categories = uniq(raw.categories || []);
    if (!categories.length) categories = inferCategoriesFromText(combinedText);

    const eligibleMccList = uniq([
        ...(raw.eligibleMccList || []),
        ...inferMccFromCategories(categories),
    ]);

    let couponCode = raw.couponCode ? cleanText(raw.couponCode).toUpperCase() : null;
    if (couponCode && !isValidCouponCode(couponCode)) couponCode = null;

    const normalizedDiscountValue = discountType === 'emi' || discountType === 'complimentary'
        ? (discountValue != null ? cleanText(String(discountValue)) : null)
        : (discountValue && Number(discountValue) > 0 ? Number(discountValue) : null);

    return {
        sourceUrl,
        normalizedUrl,
        sourceType,
        bankName: normalizeBankName(raw.bankName),
        cardName: normalizeCardName(raw.cardName),
        merchantName: normalizeMerchantName(raw.merchantName) || normalizeMerchantName(raw.offerTitle),
        offerTitle: cleanText(raw.offerTitle) || null,
        offerDescription: cleanText(raw.offerDescription) || null,
        discountType,
        discountValue: normalizedDiscountValue,
        currency: normalizeCurrency(raw.currency, combinedText),
        minSpend: raw.minSpend != null ? toNumber(String(raw.minSpend)) : null,
        capValue: raw.capValue != null ? toNumber(String(raw.capValue)) : null,
        validFrom: parseDate(raw.validFrom),
        validTo: parseDate(raw.validTo),
        couponCode,
        paymentMethods: uniq((raw.paymentMethods || []).map(cleanText)),
        eligibleMccList,
        categories,
        stackable: !!raw.stackable,
        termsUrl: raw.termsUrl || null,
        parserConfidence: raw.confidence ?? 0,
        parserName: raw.parserName || null,
        parserReason: raw.parserReason || null,
        crawlDepth: raw.crawlDepth ?? 0,
        pageLength: raw.pageLength ?? (raw.rawText ? raw.rawText.length : 0),
        scrapedAt: raw.scrapedAt || new Date().toISOString(),
        rawText: cleanText(raw.rawText),
        rawHtml: raw.rawHtml || null,
        discoveryQuery: raw.discoveryQuery || null,
        discoverySource: raw.discoverySource || null,
        serpRank: raw.serpRank != null ? Number(raw.serpRank) : null,
        fromDiscovery: !!raw.fromDiscovery,
        schemaVersion: raw.schemaVersion || '1.0',
        parserVersion: raw.parserVersion || null,
        pageType: raw.pageType || null,
    };
}
