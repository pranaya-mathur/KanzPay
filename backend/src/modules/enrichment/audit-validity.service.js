/**
 * Validity audit: SQL pass + optional LLM sample re-check.
 */
import config from '../../config.js';
import logger from '../../shared/utils/logger.js';
import {
    auditExpiredOffers,
    findOffersForLlmAudit,
    updateOfferEnrichment,
} from '../offers/offers.repository.js';
import { auditOfferWithLlm, isEnrichmentAvailable } from '../enrichment/offer-llm-enrichment.service.js';
import { mergeEnrichmentIntoOffer, hasBlockingEnrichmentFlags } from '../enrichment/offer-field-merge.service.js';
import { deriveValidityStatus } from '../ingestion/validity.service.js';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function runValidityAudit(options = {}) {
    const sqlStats = await auditExpiredOffers();

    const llmStats = {
        sampled: 0,
        updated: 0,
        failed: 0,
    };

    const sampleSize = options.llmSampleSize ?? config.auditLlmSampleSize;

    if (isEnrichmentAvailable() && sampleSize > 0) {
        const offers = await findOffersForLlmAudit(sampleSize);

        for (const offer of offers) {
            llmStats.sampled += 1;
            try {
                const audit = await auditOfferWithLlm(offer);
                if (!audit) {
                    llmStats.failed += 1;
                    continue;
                }

                const { result, auditEntry } = audit;
                const existingEnrichment = offer.llmEnrichment || {};
                const auditHistory = Array.isArray(existingEnrichment.audit_history)
                    ? existingEnrichment.audit_history
                    : [];

                if (hasBlockingEnrichmentFlags(result.flags)) {
                    await updateOfferEnrichment(offer.id, {
                        validityStatus: result.flags.includes('expired') ? 'expired' : 'unknown',
                        verifyRequired: true,
                        llmConfidence: result.confidence,
                        llmEnrichmentJson: {
                            ...existingEnrichment,
                            audit_history: [...auditHistory, auditEntry],
                        },
                    });
                    llmStats.updated += 1;
                } else {
                    const { patch } = mergeEnrichmentIntoOffer(offer, result);
                    await updateOfferEnrichment(offer.id, {
                        validFrom: patch.validFrom,
                        validTo: patch.validTo,
                        minSpend: patch.minSpend,
                        capValue: patch.capValue,
                        cardName: patch.cardName,
                        couponCode: patch.couponCode,
                        termsUrl: patch.termsUrl,
                        validityStatus: patch.validityStatus || deriveValidityStatus({
                            validFrom: patch.validFrom ?? offer.validFrom,
                            validTo: patch.validTo ?? offer.validTo,
                            verifyRequired: patch.verifyRequired,
                        }),
                        verifyRequired: patch.verifyRequired,
                        llmConfidence: patch.llmConfidence,
                        llmEnrichmentJson: {
                            ...patch.llmEnrichmentJson,
                            audit_history: [...auditHistory, auditEntry],
                        },
                    });
                    llmStats.updated += 1;
                }
            } catch (err) {
                logger.warn('LLM audit offer failed', { offerId: offer.id, error: err.message });
                llmStats.failed += 1;
            }

            await sleep(config.enrichmentDelayMs);
        }
    }

    const summary = { sql: sqlStats, llm: llmStats };
    logger.info('Validity audit complete', summary);
    return summary;
}
