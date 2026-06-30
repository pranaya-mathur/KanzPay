/**
 * Batch LLM enrichment orchestration for offers missing eligibility fields.
 */
import { query } from '../../db/pool.js';
import config from '../../config.js';
import logger from '../../shared/utils/logger.js';
import {
    findOffersNeedingEnrichment,
    updateOfferEnrichment,
} from '../offers/offers.repository.js';
import { enrichOfferWithLlm, isEnrichmentAvailable, sleep } from './offer-llm-enrichment.service.js';
import { mergeEnrichmentIntoOffer, hasBlockingEnrichmentFlags } from './offer-field-merge.service.js';
import { quarantineBlockingEnrichment } from './llm-quarantine.service.js';

async function createLlmEnrichRun(limit) {
    const { rows } = await query(
        `INSERT INTO ingestion_runs (run_type, input_json, status)
         VALUES ('llm_enrich', $1, 'running')
         RETURNING id`,
        [JSON.stringify({ limit })],
    );
    return rows[0].id;
}

async function finishLlmEnrichRun(runId, status, stats, errorMessage = null) {
    await query(
        `UPDATE ingestion_runs
         SET status = $2, stats_json = $3, finished_at = NOW(), error_message = $4
         WHERE id = $1`,
        [runId, status, JSON.stringify(stats), errorMessage],
    );
}

/**
 * @param {object} [options]
 * @param {number} [options.limit]
 * @returns {Promise<object>}
 */
export async function runOfferEnrichmentBatch(options = {}) {
    if (!isEnrichmentAvailable()) {
        logger.warn('Enrichment skipped: OPENAI_API_KEY not configured');
        return { processed: 0, enriched: 0, skipped: 0, failed: 0, flagged: 0, quarantined: 0, reason: 'no_api_key' };
    }

    const limit = options.limit ?? config.enrichmentBatchSize;
    const offers = await findOffersNeedingEnrichment(limit);
    const runId = await createLlmEnrichRun(limit);

    const stats = {
        processed: 0,
        enriched: 0,
        skipped: 0,
        failed: 0,
        flagged: 0,
        quarantined: 0,
    };

    try {
        for (const offer of offers) {
            stats.processed += 1;

            try {
                const llm = await enrichOfferWithLlm(offer);
                if (!llm) {
                    stats.failed += 1;
                    await sleep(config.enrichmentDelayMs);
                    continue;
                }

                if (hasBlockingEnrichmentFlags(llm.flags)) {
                    stats.flagged += 1;
                    const quarantined = await quarantineBlockingEnrichment({ runId, offer, llm });
                    if (quarantined) {
                        stats.quarantined += 1;
                    } else {
                        await updateOfferEnrichment(offer.id, {
                            validityStatus: llm.flags.includes('expired') ? 'expired' : 'unknown',
                            verifyRequired: true,
                            llmConfidence: llm.confidence,
                            llmEnrichmentJson: {
                                ...(offer.llmEnrichment || {}),
                                lastEnrichment: {
                                    at: new Date().toISOString(),
                                    confidence: llm.confidence,
                                    flags: llm.flags,
                                    blocked: true,
                                },
                            },
                        });
                    }
                    await sleep(config.enrichmentDelayMs);
                    continue;
                }

                const { patch } = mergeEnrichmentIntoOffer(offer, llm);

                const hasChanges = Object.keys(patch).some((k) =>
                    !['llmEnrichmentJson', 'llmConfidence', 'validityStatus', 'verifyRequired'].includes(k)
                    && patch[k] != null,
                );

                if (!hasChanges && patch.verifyRequired === offer.verifyRequired) {
                    await updateOfferEnrichment(offer.id, {
                        validityStatus: patch.validityStatus,
                        verifyRequired: patch.verifyRequired,
                        llmConfidence: patch.llmConfidence,
                        llmEnrichmentJson: patch.llmEnrichmentJson,
                    });
                    stats.skipped += 1;
                } else {
                    await updateOfferEnrichment(offer.id, {
                        validFrom: patch.validFrom,
                        validTo: patch.validTo,
                        minSpend: patch.minSpend,
                        capValue: patch.capValue,
                        cardName: patch.cardName,
                        couponCode: patch.couponCode,
                        termsUrl: patch.termsUrl,
                        validityStatus: patch.validityStatus,
                        verifyRequired: patch.verifyRequired,
                        llmConfidence: patch.llmConfidence,
                        llmEnrichmentJson: patch.llmEnrichmentJson,
                    });
                    stats.enriched += 1;
                }
            } catch (err) {
                logger.error('Enrichment offer failed', { offerId: offer.id, error: err.message });
                stats.failed += 1;
            }

            await sleep(config.enrichmentDelayMs);
        }

        await finishLlmEnrichRun(runId, 'completed', stats);
        logger.info('Offer enrichment batch complete', stats);
        return stats;
    } catch (err) {
        await finishLlmEnrichRun(runId, 'failed', stats, err.message);
        throw err;
    }
}
