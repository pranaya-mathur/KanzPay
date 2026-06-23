import config from '../../config.js';

/** Canonical offers use fresh/stale only — quarantine is a separate table. */
export function resolveFreshnessStatus(confidence, confidenceFloor = config.confidenceFloor) {
    return confidence >= confidenceFloor ? 'fresh' : 'stale';
}

export function shouldRouteToQuarantine(confidence, confidenceFloor = config.confidenceFloor) {
    return confidence < confidenceFloor;
}

export function computeStaleCutoff(sourceType, now = new Date()) {
    const days = config.sourceStaleDays[sourceType] || config.staleAfterDays;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
}

export function shouldMarkStale(offer, now = new Date()) {
    if (!offer?.lastSeenAt) return true;
    const cutoff = computeStaleCutoff(offer.sourceType, now);
    return new Date(offer.lastSeenAt) < cutoff;
}

export function isValidNow(offer, now = new Date()) {
    if (!offer.validTo) return true;
    const end = new Date(offer.validTo);
    if (Number.isNaN(end.getTime())) return true;
    return end >= new Date(now.toISOString().split('T')[0]);
}

export function touchFreshness(existingOffer, seenAt = new Date()) {
    return {
        lastSeenAt: seenAt.toISOString(),
        freshnessStatus: existingOffer.freshnessStatus === 'stale' ? 'stale' : 'fresh',
    };
}
