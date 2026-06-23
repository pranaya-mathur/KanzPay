import { getSourceReliability } from '../../shared/schemas/source.schema.js';
import { applySourceConfidenceAdjustment } from '../sources/source-policy.service.js';
import { cleanText } from '../../shared/utils/text-normalize.js';

const GENERIC_CATEGORY_TITLES = [
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
];

const GENERIC_VISA_DETAIL_TITLES = [/^cards?\s*&\s*rewards?$/i];

export function scoreOfferConfidence(offer, sourceContext = null) {
    let score = 0.1;

    // Registry source confidence when available
    if (sourceContext?.confidence) {
        score += Number(sourceContext.confidence) * 0.15;
    } else {
        score += getSourceReliability(offer.sourceType) * 0.2;
    }

    // Parser confidence (crawler-side signal)
    score += Math.min(0.2, (offer.parserConfidence || 0) * 0.2);

    // Page type quality
    if ((offer.crawlDepth || 0) >= 1) score += 0.12;
    else score += 0.05;

    if ((offer.pageLength || 0) >= 1500) score += 0.08;
    else if ((offer.pageLength || 0) < 400) score -= 0.1;

    // Field completeness
    if (offer.offerTitle && offer.offerTitle.length >= 6) score += 0.08;
    if (offer.merchantName) score += 0.08;
    if (offer.bankName || offer.cardName) score += 0.05;
    if (offer.discountType) score += 0.08;
    if (offer.discountValue != null && String(offer.discountValue).length > 0) score += 0.08;
    if (offer.validTo) score += 0.05;
    if (offer.couponCode) score += 0.06;
    if (offer.offerDescription && offer.offerDescription.length > 40) score += 0.04;
    if ((offer.categories || []).length) score += 0.03;

    // Structured offer signals in text
    const body = `${offer.offerTitle || ''} ${offer.offerDescription || ''} ${offer.rawText || ''}`;
    if (/(?:cashback|%\s*off|AED\s*\d|valid until|minimum spend|cardholder)/i.test(body)) {
        score += 0.06;
    }

    // Penalties for known noisy patterns
    if (isCategoryHeader(offer)) score -= 0.2;
    if (isGenericVisaDetail(offer)) score -= 0.25;
    if (/help (?:centre|center)|customer support|privacy policy/i.test(offer.offerTitle || '')) {
        score -= 0.3;
    }
    if (/log in or register/i.test(body) && !offer.discountValue) score -= 0.05;

    if (sourceContext) {
        score = applySourceConfidenceAdjustment(score, sourceContext);
    }

    return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

export function isCategoryHeader(offer) {
    const title = cleanText(offer.offerTitle);
    if (!title) return false;
    if (GENERIC_CATEGORY_TITLES.some((p) => p.test(title))) return true;
    if (/offers?$/i.test(title) && !offer.merchantName && !offer.discountValue) return true;
    return false;
}

export function isGenericVisaDetail(offer) {
    if (offer.sourceType !== 'visaUAE') return false;
    if ((offer.crawlDepth || 0) < 1) return false;
    const title = cleanText(offer.offerTitle);
    return GENERIC_VISA_DETAIL_TITLES.some((p) => p.test(title));
}
