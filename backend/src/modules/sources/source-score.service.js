/**
 * Compute aggregate source health score (0–1) from crawl/ingestion metrics.
 */

export function computeFieldCompleteness(offer) {
    const fields = [
        offer.merchantName,
        offer.discountType,
        offer.discountValue,
        offer.validTo,
        offer.offerDescription,
        offer.bankName || offer.cardName,
    ];
    const filled = fields.filter((f) => f != null && String(f).length > 0).length;
    return Math.round((filled / fields.length) * 1000) / 1000;
}

export function computeMerchantYield(offers) {
    if (!offers.length) return 0;
    const withMerchant = offers.filter((o) => o.merchantName && o.merchantName.length > 2).length;
    return Math.round((withMerchant / offers.length) * 1000) / 1000;
}

export function computeQuarantineRate(quarantined, total) {
    if (!total) return 0;
    return Math.round((quarantined / total) * 1000) / 1000;
}

export function computeParseSuccessRate(accepted, total) {
    if (!total) return 0;
    return Math.round((accepted / total) * 1000) / 1000;
}

export function computeFreshnessScore(offers) {
    if (!offers.length) return 0;
    const fresh = offers.filter((o) => o.freshnessStatus === 'fresh').length;
    return Math.round((fresh / offers.length) * 1000) / 1000;
}

/**
 * @param {object} metrics
 * @returns {number} 0–1 source score
 */
export function computeSourceScore(metrics) {
    const {
        avgOfferConfidence = 0,
        avgFieldCompleteness = 0,
        avgParseSuccessRate = 0,
        avgMerchantYield = 0,
        avgFreshnessScore = 0,
        quarantineRate = 0,
        failureRate = 0,
        sampleSize = 0,
    } = metrics;

    if (sampleSize < 3) {
        return Math.round(Math.min(0.55, avgOfferConfidence || 0.3) * 1000) / 1000;
    }

    let score = 0;
    score += avgOfferConfidence * 0.25;
    score += avgFieldCompleteness * 0.2;
    score += avgParseSuccessRate * 0.15;
    score += avgMerchantYield * 0.2;
    score += avgFreshnessScore * 0.1;
    score -= quarantineRate * 0.15;
    score -= failureRate * 0.1;

    return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

export function aggregateOfferMetrics(offers = []) {
    if (!offers.length) {
        return {
            avgOfferConfidence: 0,
            avgFieldCompleteness: 0,
            avgMerchantYield: 0,
            avgFreshnessScore: 0,
            sampleSize: 0,
        };
    }

    const completeness = offers.map(computeFieldCompleteness);
    const avgCompleteness = completeness.reduce((a, b) => a + b, 0) / completeness.length;
    const avgConfidence = offers.reduce((a, o) => a + (Number(o.confidence) || 0), 0) / offers.length;

    return {
        avgOfferConfidence: Math.round(avgConfidence * 1000) / 1000,
        avgFieldCompleteness: Math.round(avgCompleteness * 1000) / 1000,
        avgMerchantYield: computeMerchantYield(offers),
        avgFreshnessScore: computeFreshnessScore(offers),
        sampleSize: offers.length,
    };
}
