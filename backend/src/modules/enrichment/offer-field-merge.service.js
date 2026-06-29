/**
 * Safe merge of LLM-extracted fields into existing offer records.
 */
import { deriveValidityStatus, shouldRequireVerification } from '../ingestion/validity.service.js';
import config from '../../config.js';

const PROTECTED_OVERWRITE_FIELDS = new Set(['bankName', 'merchantName', 'discountValue']);

/**
 * @param {object} existing - Current offer row (camelCase)
 * @param {object} llm - Parsed LLM enrichment result
 * @returns {{ patch: object, llmEnrichmentJson: object, flags: string[] }}
 */
export function mergeEnrichmentIntoOffer(existing, llm) {
    const evidenceByField = new Map((llm.evidence || []).map((e) => [e.field, e.quote]));
    const minAutoConfidence = config.enrichmentMinConfidenceAuto;
    const patch = {};
    const applied = [];
    const skipped = [];

    const fieldMap = [
        ['validFrom', 'valid_from', existing.validFrom],
        ['validTo', 'valid_to', existing.validTo],
        ['minSpend', 'min_spend', existing.minSpend],
        ['capValue', 'cap_value', existing.capValue],
        ['cardName', 'card_name', existing.cardName],
        ['couponCode', 'coupon_code', existing.couponCode],
        ['termsUrl', 'terms_url', existing.termsUrl],
    ];

    for (const [camelKey, snakeKey, currentValue] of fieldMap) {
        const llmValue = llm[snakeKey] ?? llm[camelKey];
        if (llmValue == null || llmValue === '') continue;

        const hasEvidence = evidenceByField.has(snakeKey) || evidenceByField.has(camelKey);
        const canFillNull = currentValue == null || currentValue === '';
        const canOverwrite = llm.confidence >= minAutoConfidence && hasEvidence;

        if (PROTECTED_OVERWRITE_FIELDS.has(camelKey) && currentValue != null && !canOverwrite) {
            skipped.push({ field: camelKey, reason: 'protected_field' });
            continue;
        }

        if (canFillNull || canOverwrite) {
            patch[camelKey] = normalizeFieldValue(camelKey, llmValue);
            applied.push({ field: camelKey, value: patch[camelKey], evidence: hasEvidence });
        } else {
            skipped.push({ field: camelKey, reason: 'existing_value_no_evidence' });
        }
    }

    const mergedValidTo = patch.validTo ?? existing.validTo;
    const mergedValidFrom = patch.validFrom ?? existing.validFrom;
    const verifyRequired = shouldRequireVerification(
        { validTo: mergedValidTo, llmConfidence: llm.confidence },
        config.enrichmentVerifyThreshold,
    );

    patch.verifyRequired = verifyRequired;
    patch.validityStatus = deriveValidityStatus({
        validFrom: mergedValidFrom,
        validTo: mergedValidTo,
        verifyRequired,
    });
    patch.llmConfidence = llm.confidence;
    patch.llmEnrichmentJson = {
        ...((existing.llmEnrichment && typeof existing.llmEnrichment === 'object') ? existing.llmEnrichment : {}),
        lastEnrichment: {
            at: new Date().toISOString(),
            confidence: llm.confidence,
            flags: llm.flags || [],
            evidence: llm.evidence || [],
            applied,
            skipped,
        },
    };

    return {
        patch,
        llmEnrichmentJson: patch.llmEnrichmentJson,
        flags: llm.flags || [],
        applied,
        skipped,
    };
}

function normalizeFieldValue(field, value) {
    if (field === 'minSpend' || field === 'capValue') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    if (field === 'validFrom' || field === 'validTo') {
        return String(value).slice(0, 10);
    }
    if (field === 'couponCode') {
        return String(value).toUpperCase().trim();
    }
    return String(value).trim();
}

/**
 * Whether LLM flags indicate the offer should not be used for checkout.
 */
export function hasBlockingEnrichmentFlags(flags = []) {
    const blocking = new Set(['generic_page', 'not_an_offer', 'expired']);
    return flags.some((f) => blocking.has(f));
}
