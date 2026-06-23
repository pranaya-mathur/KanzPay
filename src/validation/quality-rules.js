import { cleanText } from '../utils/normalize.js';
import { isValidCouponCode } from '../schema/offerSchema.js';

const CATEGORY_TITLE_PATTERNS = [
    /^cards?\s*&\s*rewards?$/i,
    /^seasonal offers?$/i,
    /^travel\s*&?\s*hotel offers?$/i,
    /^food\s*&?\s*drink offers?$/i,
    /^fashion\s*&?\s*retail offers?$/i,
    /^online offers?$/i,
    /^entertainment offers?$/i,
    /^wellness offers?$/i,
    /^0%\s*epp offers?$/i,
    /^العربية/i,
    /^explore the world with/i,
    /^card offers$/i,
];

const FAB_CATEGORY_PATTERNS = [
    /^(?:seasonal|travel|food|fashion|online|entertainment|wellness)\s+(?:&\s+\w+\s+)?offers?$/i,
    /^0%\s*epp\b/i,
];

export function isCategoryHeaderTitle(title, sourceType = null) {
    const t = cleanText(title);
    if (!t) return false;
    if (CATEGORY_TITLE_PATTERNS.some((p) => p.test(t))) return true;
    if (sourceType === 'fab' && FAB_CATEGORY_PATTERNS.some((p) => p.test(t))) return true;
    if (/offers?$/i.test(t) && t.length < 35 && !/\d/.test(t)) return true;
    return false;
}

export function isShellPage(rawText, rawHtml) {
    const textLen = cleanText(rawText).length;
    const htmlLen = (rawHtml || '').length;
    if (/try one of these popular visa pages instead/i.test(rawText || '')) return true;
    if (/oops|page not found|can't seem to find/i.test(rawText || '') && textLen < 500) return true;
    if (textLen < 400 && htmlLen > 5000) return true;
    if (textLen < 80) return true;
    return false;
}

export function isErrorPage(rawText, rawHtml) {
    const t = cleanText(rawText);
    if (/^404\b|page not found|access denied/i.test(t) && t.length < 800) return true;
    if (/oops!?$/im.test(t) && !/\d+\s*%/.test(t)) return true;
    return false;
}

export function hasMeaningfulOfferFields(offer) {
    if (!offer) return false;
    if (cleanText(offer.merchantName)?.length >= 2) return true;
    if (cleanText(offer.offerTitle)?.length >= 4 && !isCategoryHeaderTitle(offer.offerTitle, offer.sourceType)) return true;
    if (offer.discountType && offer.discountValue != null) return true;
    if (isValidCouponCode(offer.couponCode)) return true;
    if (cleanText(offer.bankName)) return true;
    return false;
}

export function hasSaneAmounts(offer) {
    if (offer.discountType === 'percent' && Number(offer.discountValue) > 100) return false;
    if (offer.minSpend != null && offer.minSpend < 0) return false;
    if (offer.capValue != null && offer.capValue < 0) return false;
    return true;
}
