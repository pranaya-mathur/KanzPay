import { SOURCE_STATUSES } from '../../shared/schemas/source.schema.js';

const APPROVED_MIN_SCORE = 0.75;
const PROBATION_MIN_SCORE = 0.45;
const MAX_QUARANTINE_RATE_APPROVED = 0.15;
const MIN_MERCHANT_YIELD_APPROVED = 0.6;

/** Tier A banks — locked in DB; must never auto-reject via health refresh. */
export const TIER_A_SOURCE_TYPES = new Set([
    'emiratesNbd', 'adcb', 'mashreq', 'fab', 'dib', 'adib',
]);

export function isTierASourceType(sourceType) {
    return TIER_A_SOURCE_TYPES.has(sourceType);
}

/**
 * Classify source status from computed score and metrics.
 * Manual overrides via API are always allowed.
 */
export function classifySourceStatus(score, metrics = {}, currentStatus = null) {
    const {
        quarantineRate = 0,
        avgMerchantYield = 0,
        avgFieldCompleteness = 0,
        sampleSize = 0,
        sourceType,
    } = metrics;

    const reasons = [];

    // Hard defaults for known source patterns before enough samples
    if (sampleSize < 5 && sourceType) {
        // Tier A — approved immediately (dedicated parser profiles)
        if (isTierASourceType(sourceType)) {
            return { status: 'approved', reason: `${sourceType}: tier_a_bootstrap` };
        }
        // Tier B — probation until yield/completeness confirms quality
        if ([
            'visaUAE', 'rakBank', 'hsbc', 'citibank', 'cbd', 'mastercard',
            'groupon', 'cuponation', 'picodi', 'couponsAe', 'wethrift', 'smiles', 'noon',
        ].includes(sourceType)) {
            return { status: 'probation', reason: `${sourceType}: probation pending parser validation` };
        }
        // Discovery never crawled automatically
        if (sourceType === 'discovery') {
            return { status: 'rejected', reason: 'Discovery not enabled for automated crawl' };
        }
    }

    if (score >= APPROVED_MIN_SCORE
        && quarantineRate <= MAX_QUARANTINE_RATE_APPROVED
        && avgMerchantYield >= MIN_MERCHANT_YIELD_APPROVED
        && avgFieldCompleteness >= 0.5) {
        reasons.push(`score=${score}>=${APPROVED_MIN_SCORE}`);
        return { status: 'approved', reason: reasons.join('; ') };
    }

    if (score >= PROBATION_MIN_SCORE) {
        reasons.push(`score=${score}>=${PROBATION_MIN_SCORE}`);
        return { status: 'probation', reason: reasons.join('; ') || 'Inconsistent yield or completeness' };
    }

    // Tier A locked sources never auto-reject; worst case stays on probation
    if (isTierASourceType(sourceType)) {
        return {
            status: 'probation',
            reason: `tier_a_floor: score=${score}<${PROBATION_MIN_SCORE}`,
        };
    }

    return {
        status: 'rejected',
        reason: `score=${score}<${PROBATION_MIN_SCORE} or high noise`,
    };
}

export function canTransitionStatus(from, to) {
    if (!SOURCE_STATUSES.includes(from) || !SOURCE_STATUSES.includes(to)) return false;
    if (from === to) return true;
    return true;
}

export function statusAllowsAutoCrawl(status) {
    return status === 'approved' || status === 'probation';
}

export function statusAllowsIngestion(status) {
    return status !== 'rejected';
}

export function getStatusRecommendation(status, score, metrics) {
    if (status === 'approved') return 'Continue automated crawl at normal quality gates.';
    if (status === 'probation') {
        return `Tighter quality gates active. Improve parser for ${metrics.sourceType || 'source'} before promoting.`;
    }
    return 'Excluded from crawl planning. Manual review required to re-enable.';
}
