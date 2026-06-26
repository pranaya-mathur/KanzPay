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

const COOKIE_NOISE_PATTERNS = [
    /preference cookies/i,
    /HTTP Cookie/i,
    /stores the user'?s preferred language/i,
    /cookie is used to determine the preferred language/i,
    /maximum storage duration/i,
    /NameProviderPurpose/i,
];

const PAGE_CHROME_TITLE_PATTERNS = [
    /^(credit cards|offers|deals|promotions|rewards|shukran)$/i,
    /^UAE \|/i,
    /^credit and debit card special offers$/i,
];

export function isCookieOrPrivacyNoise(text) {
    const t = cleanText(text);
    if (!t || t.length < 40) return false;
    if (COOKIE_NOISE_PATTERNS.filter((p) => p.test(t)).length >= 2) return true;
    if (/preference cookies enable a website/i.test(t)) return true;
    return false;
}

export function isPageChromeTitle(title) {
    const t = cleanText(title);
    if (!t) return false;
    if (PAGE_CHROME_TITLE_PATTERNS.some((p) => p.test(t))) return true;
    if (t.length > 100 && /cookie|privacy policy|terms of use/i.test(t)) return true;
    return false;
}

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

export function isEarnRateNoise(text) {
    const t = cleanText(text);
    if (!t) return false;
    if (/bonus\s+touchpoint/i.test(t) && /every\s+aed\s*1\s+spent/i.test(t)) return true;
    if (/earn\s+\d+\s+bonus\s+touchpoint/i.test(t)) return true;
    if (/for\s+every\s+aed\s*1\s+spent/i.test(t) && !/(?:%\s*off|cashback)/i.test(t)) return true;
    return false;
}

export function isAdcbNavNoise(text) {
    const t = cleanText(text);
    if (!t) return false;
    if (/adcb\s+logo\s+facebook/i.test(t)) return true;
    if (/refer\s+(?:a\s+friend|your\s+friends)/i.test(t)) return true;
    if (/touchpoints\s+maxmake/i.test(t)) return true;
    return false;
}

export function isTouchpointsBurnOffer(text) {
    const t = cleanText(text);
    if (!t) return false;
    return /pay\s+with\s+touchpoints|convert\s+\d[\d,]*\s*touchpoints/i.test(t);
}

export function isNonUaeFabOffer(text, url = '') {
    const combined = `${text} ${url}`.toLowerCase();
    return /london|shard|sea\s*life|uk\b|united\s+kingdom|manchester\s+city/i.test(combined)
        && !/uae|dubai|abu\s+dhabi|sharjah|emirates/i.test(combined);
}

export function isEnbdListingNoise(merchant, title) {
    const combined = `${merchant || ''} ${title || ''}`.toLowerCase();
    if (/amazon\.ae|dubai\s+municipality|sharjah\s+free|government/i.test(combined)) return true;
    return false;
}

export function isMashreqVantageNoise(text) {
    const t = cleanText(text);
    if (!t) return false;
    if (/mashreq\s+vantage\s+(?:reward\s+)?points/i.test(t)) return true;
    if (/enjoy\s+free\s+shopping\s+with\s+mashreq\s+vantage/i.test(t)) return true;
    if (/pay\s+with\s+vantage\s+points/i.test(t)) return true;
    if (/vantage\s+points/i.test(t) && !/(?:%\s*off|cashback|AED\s*[\d,]+)/i.test(t)) return true;
    return false;
}

export function isMashreqEppOffer(text, paymentCategory = '') {
    const combined = `${text} ${paymentCategory}`.toLowerCase();
    return /easy\s+payment\s+plan|0%\s*easy\s+payment/i.test(combined);
}

export function hasSaneAmounts(offer) {
    if (offer.discountType === 'percent' && Number(offer.discountValue) > 100) return false;
    if (offer.minSpend != null && offer.minSpend < 0) return false;
    if (offer.capValue != null && offer.capValue < 0) return false;
    const dv = Number(offer.discountValue);
    if (Number.isFinite(dv) && dv > 10000) return false;
    if (dv === 1 && isEarnRateNoise(`${offer.offerTitle} ${offer.offerDescription} ${offer.rawText}`)) return false;
    return true;
}
