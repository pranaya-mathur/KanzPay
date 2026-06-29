/**
 * Merges parser ingest data with existing LLM enrichment on offer re-crawl.
 */
import { deriveValidityStatus, shouldRequireVerification } from './validity.service.js';

function coalesce(preferred, existing) {
    if (preferred != null && preferred !== '') return preferred;
    return existing ?? null;
}

/**
 * @param {object} existingRow - Raw DB row from offers table
 * @param {object} preferred - Merged preferred offer fields (camelCase)
 * @returns {object}
 */
export function mergeIngestValidity(existingRow, preferred) {
    const llmIsFresh = existingRow.llm_enriched_at
        && new Date(existingRow.llm_enriched_at) >= new Date(existingRow.last_seen_at);

    const validTo = coalesce(preferred.validTo, llmIsFresh ? existingRow.valid_to : null);
    const validFrom = coalesce(preferred.validFrom, llmIsFresh ? existingRow.valid_from : null);

    const enrichedFields = llmIsFresh ? {
        minSpend: coalesce(preferred.minSpend, existingRow.min_spend),
        capValue: coalesce(preferred.capValue, existingRow.cap_value),
        cardName: coalesce(preferred.cardName, existingRow.card_name),
        termsUrl: coalesce(preferred.termsUrl, existingRow.terms_url),
        couponCode: coalesce(preferred.couponCode, existingRow.coupon_code),
    } : {
        minSpend: preferred.minSpend ?? null,
        capValue: preferred.capValue ?? null,
        cardName: preferred.cardName ?? null,
        termsUrl: preferred.termsUrl ?? null,
        couponCode: preferred.couponCode ?? null,
    };

    const llmConfidence = llmIsFresh && existingRow.llm_confidence != null
        ? Number(existingRow.llm_confidence)
        : null;

    const verifyRequired = shouldRequireVerification({ validTo, llmConfidence });
    const validityStatus = deriveValidityStatus({ validFrom, validTo, verifyRequired });

    return {
        validFrom,
        validTo,
        verifyRequired,
        validityStatus,
        enrichedFields,
        llmIsFresh,
    };
}

/**
 * Compute validity flags for a new offer insert.
 */
export function resolveInsertValidity(dbOffer) {
    const verifyRequired = shouldRequireVerification({
        validTo: dbOffer.validTo,
        llmConfidence: null,
    });
    const validityStatus = deriveValidityStatus({
        validFrom: dbOffer.validFrom,
        validTo: dbOffer.validTo,
        verifyRequired,
    });
    return { verifyRequired, validityStatus };
}
