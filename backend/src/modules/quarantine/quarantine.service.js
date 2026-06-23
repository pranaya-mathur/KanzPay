import { withTransaction } from '../../db/pool.js';
import { normalizeRawOffer } from '../ingestion/normalization.service.js';
import { scoreOfferConfidence } from '../ingestion/confidence-score.service.js';
import { passesQualityGate } from '../ingestion/quality-gate.service.js';
import { routeIngestionRecord } from '../ingestion/quarantine.service.js';
import { toDbOffer, upsertOffer } from '../ingestion/ingestion.service.js';
import * as quarantineRepo from './quarantine.repository.js';
import config from '../../config.js';

export async function listQuarantine(query) {
    const { validateQuarantineQuery } = await import('../../shared/schemas/offer.schema.js');
    const filters = validateQuarantineQuery(query);
    return quarantineRepo.findQuarantineRecords(filters);
}

export async function getQuarantineRecord(id) {
    return quarantineRepo.findQuarantineById(id);
}

export async function getQuarantineStats() {
    return quarantineRepo.getQuarantineStats();
}

export async function promoteQuarantineRecord(id, { reviewedBy = 'api' } = {}) {
    const record = await quarantineRepo.findQuarantineById(id);
    if (!record) return { error: 'not_found' };
    if (!record.normalizedPayloadJson) return { error: 'no_normalized_payload' };

    const normalized = normalizeRawOffer(record.normalizedPayloadJson);
    const confidence = scoreOfferConfidence(normalized, null);
    const gate = passesQualityGate(normalized);
    const routing = routeIngestionRecord({ gate, confidence, confidenceFloor: config.confidenceFloor });

    if (routing.destination !== 'offers') {
        return { error: 'still_fails_gate', reasons: routing.reasons, confidence };
    }

    const dbOffer = toDbOffer(normalized, confidence, normalized.scrapedAt, record.sourceId);
    let result;
    await withTransaction(async (client) => {
        result = await upsertOffer(client, dbOffer, {});
        await quarantineRepo.updateQuarantineReview(id, { reviewStatus: 'promoted', reviewedBy });
    });

    return { action: 'promoted', offer: result.offer, previousQuarantine: record };
}

export async function rejectQuarantineRecord(id, { reviewedBy = 'api' } = {}) {
    const record = await quarantineRepo.findQuarantineById(id);
    if (!record) return { error: 'not_found' };
    const updated = await quarantineRepo.updateQuarantineReview(id, { reviewStatus: 'rejected', reviewedBy });
    return { action: 'rejected', record: updated };
}

export async function replayQuarantineRecord(id) {
    const record = await quarantineRepo.findQuarantineById(id);
    if (!record) return { error: 'not_found' };

    const payload = record.normalizedPayloadJson || record.rawPayloadJson;
    if (!payload) return { error: 'no_payload' };

    const normalized = normalizeRawOffer(payload);
    const confidence = scoreOfferConfidence(normalized, null);
    const gate = passesQualityGate(normalized);
    const routing = routeIngestionRecord({ gate, confidence, confidenceFloor: config.confidenceFloor });

    return {
        normalized,
        confidence,
        gate,
        routing,
        wouldPromote: routing.destination === 'offers',
    };
}
