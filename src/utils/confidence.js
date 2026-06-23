import { isGarbageTitle } from '../schema/offerSchema.js';

/**
 * Score 0–1 based on extracted field completeness and signal quality.
 */
export function scoreConfidence(offer, rawText = '') {
    let score = 0.15;

    const title = offer.offerTitle || '';
    if (title && !isGarbageTitle(title)) {
        score += title.length >= 10 ? 0.2 : 0.1;
    }

    if (offer.discountType) score += 0.15;
    if (offer.discountValue != null && offer.discountValue > 0) score += 0.1;
    if (offer.merchantName) score += 0.1;
    if (offer.bankName || offer.cardName) score += 0.05;
    if (offer.couponCode && offer.couponCode.length >= 3) score += 0.1;
    if (offer.minSpend != null) score += 0.03;
    if (offer.capValue != null) score += 0.03;
    if (offer.validTo) score += 0.05;
    if (offer.offerDescription && offer.offerDescription.length > 30) score += 0.04;

    // Penalize navigation-heavy pages
    const navNoise = /help (?:centre|center)|customer support|schedule of charges|privacy policy/i;
    if (navNoise.test(title)) score -= 0.3;

    // Boost when offer keywords appear in body
    const offerSignals = /(?:cashback|%\s*off|AED\s*\d|promo code|valid until|minimum spend|cardholder)/i;
    if (offerSignals.test(rawText)) score += 0.08;

    // Penalize very short pages (likely error shells)
    if (rawText && rawText.length < 500) score -= 0.15;

    return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
