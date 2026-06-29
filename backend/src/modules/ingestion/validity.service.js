/**
 * Derives offer validity_status from date fields and verification flags.
 * Separate from freshness_status (crawl recency).
 */

export const VALIDITY_STATUSES = ['active', 'expired', 'not_yet_active', 'unknown'];

/**
 * @param {object} offer - { validFrom, validTo, verifyRequired }
 * @param {Date} [now]
 * @returns {'active'|'expired'|'not_yet_active'|'unknown'}
 */
export function deriveValidityStatus(offer, now = new Date()) {
    const today = toDateOnly(now);

    if (offer.validTo) {
        const end = parseDateOnly(offer.validTo);
        if (end && end < today) return 'expired';
    }

    if (offer.validFrom) {
        const start = parseDateOnly(offer.validFrom);
        if (start && start > today) return 'not_yet_active';
    }

    if (!offer.validTo && offer.verifyRequired) return 'unknown';

    return 'active';
}

/**
 * Whether an offer should be excluded from checkout-safe queries.
 */
export function isCheckoutSafeValidity(status) {
    return status === 'active';
}

function parseDateOnly(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(String(value).slice(0, 10));
    if (Number.isNaN(d.getTime())) return null;
    return toDateOnly(d);
}

function toDateOnly(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Whether verify_required should be set after enrichment when valid_to is still missing.
 */
export function shouldRequireVerification({ validTo, llmConfidence }, threshold = 0.65) {
    if (!validTo) return true;
    if (llmConfidence != null && llmConfidence < threshold) return true;
    return false;
}
