/**
 * Routes high-confidence blocking LLM enrichment flags to quarantine.
 */
import { withTransaction } from '../../db/pool.js';
import { buildQuarantineRecord, QUARANTINE_TYPES } from '../ingestion/quarantine.service.js';
import { insertQuarantineRecord } from '../quarantine/quarantine.repository.js';

const QUARANTINE_CONFIDENCE_FLOOR = 0.7;

/**
 * @param {object} params
 * @param {string} params.runId
 * @param {object} params.offer
 * @param {object} params.llm - Parsed LLM enrichment result
 * @returns {Promise<boolean>} true when a quarantine record was created
 */
export async function quarantineBlockingEnrichment({ runId, offer, llm }) {
    if ((llm.confidence ?? 0) < QUARANTINE_CONFIDENCE_FLOOR) {
        return false;
    }

    const validityStatus = (llm.flags || []).includes('expired') ? 'expired' : 'unknown';
    const reasons = [...(llm.flags || []), 'llm_blocking_flags'];
    const enrichmentJson = {
        ...(offer.llmEnrichment && typeof offer.llmEnrichment === 'object' ? offer.llmEnrichment : {}),
        lastEnrichment: {
            at: new Date().toISOString(),
            confidence: llm.confidence,
            flags: llm.flags || [],
            blocked: true,
            quarantined: true,
        },
    };

    const record = buildQuarantineRecord({
        runId,
        rawPayload: {
            offerId: offer.id,
            sourceUrl: offer.sourceUrl,
            offerTitle: offer.offerTitle,
        },
        normalized: {
            sourceUrl: offer.sourceUrl,
            sourceType: offer.sourceType,
            bankName: offer.bankName,
            merchantName: offer.merchantName,
            offerTitle: offer.offerTitle,
        },
        confidence: llm.confidence,
        reasons,
        quarantineType: QUARANTINE_TYPES.LLM_REVIEW,
    });

    await withTransaction(async (client) => {
        await insertQuarantineRecord(client, record);
        await client.query(
            `UPDATE offers SET
                freshness_status = 'stale',
                validity_status = $2,
                verify_required = true,
                llm_enriched_at = NOW(),
                llm_confidence = $3,
                llm_enrichment_json = $4,
                updated_at = NOW()
             WHERE id = $1`,
            [offer.id, validityStatus, llm.confidence, JSON.stringify(enrichmentJson)],
        );
    });

    return true;
}
