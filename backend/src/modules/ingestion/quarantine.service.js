import config from '../../config.js';
import { generateCanonicalKey } from './dedupe.service.js';

export const QUARANTINE_TYPES = {
    INVALID_SCHEMA: 'invalid_schema',
    QUALITY_GATE: 'quality_gate_failed',
    LOW_CONFIDENCE: 'below_confidence_floor',
    REJECTED_SOURCE: 'rejected_source',
    DISCOVERY_REVIEW: 'discovery_review',
    LLM_REVIEW: 'llm_review_required',
};

/**
 * Decide whether a parsed record belongs in canonical offers or quarantine.
 * Quarantine never blocks the pipeline — callers always persist the outcome.
 */
export function routeIngestionRecord({ gate, confidence, confidenceFloor = config.confidenceFloor }) {
    if (!gate?.passed) {
        return {
            destination: 'quarantine',
            quarantineType: QUARANTINE_TYPES.QUALITY_GATE,
            reasons: gate?.reasons || ['quality_gate_failed'],
        };
    }

    if (confidence < confidenceFloor) {
        return {
            destination: 'quarantine',
            quarantineType: QUARANTINE_TYPES.LOW_CONFIDENCE,
            reasons: ['below_confidence_floor'],
        };
    }

    return {
        destination: 'offers',
        quarantineType: null,
        reasons: [],
    };
}

export function routeInvalidSchema(detail) {
    return {
        destination: 'quarantine',
        quarantineType: QUARANTINE_TYPES.INVALID_SCHEMA,
        reasons: ['invalid_schema', detail].filter(Boolean),
    };
}

export function buildQuarantineRecord({
    runId,
    rawPayload,
    normalized = null,
    confidence = null,
    reasons = [],
    canonicalKey = null,
    sourceId = null,
    quarantineType = null,
}) {
    const sourceUrl = normalized?.sourceUrl || rawPayload?.sourceUrl || null;
    const key = canonicalKey || (normalized ? generateCanonicalKey(normalized) : null);

    return {
        runId,
        sourceId,
        sourceUrl,
        canonicalKey: key,
        rawPayloadJson: rawPayload,
        normalizedPayloadJson: normalized,
        rejectionReasonsJson: reasons,
        confidence,
        sourceType: normalized?.sourceType || rawPayload?.sourceType || null,
        discoveryQuery: normalized?.discoveryQuery || rawPayload?.discoveryQuery || null,
        discoverySource: normalized?.discoverySource || rawPayload?.discoverySource || null,
        serpRank: normalized?.serpRank ?? rawPayload?.serpRank ?? null,
        quarantineType: quarantineType || inferQuarantineType(reasons),
    };
}

function inferQuarantineType(reasons = []) {
    if (reasons.includes('invalid_schema')) return QUARANTINE_TYPES.INVALID_SCHEMA;
    if (reasons.includes('rejected_source')) return QUARANTINE_TYPES.REJECTED_SOURCE;
    if (reasons.some((r) => r === 'discovery_review' || r === 'weak_discovery_signals' || r === 'unknown_generic_source')) {
        return QUARANTINE_TYPES.DISCOVERY_REVIEW;
    }
    if (reasons.includes('below_confidence_floor')) return QUARANTINE_TYPES.LOW_CONFIDENCE;
    return QUARANTINE_TYPES.QUALITY_GATE;
}

export function isBelowConfidenceFloor(confidence, floor = config.confidenceFloor) {
    return confidence < floor;
}
