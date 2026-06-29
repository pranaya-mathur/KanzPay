import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeIngestValidity, resolveInsertValidity } from '../src/modules/ingestion/ingest-validity-merge.service.js';

describe('mergeIngestValidity', () => {
    const existingRow = {
        valid_from: '2026-01-01',
        valid_to: '2026-12-31',
        min_spend: 100,
        cap_value: 50,
        card_name: 'Visa Platinum',
        terms_url: 'https://bank.example/terms',
        coupon_code: 'SAVE10',
        llm_enriched_at: '2026-06-28T10:00:00.000Z',
        last_seen_at: '2026-06-27T10:00:00.000Z',
        llm_confidence: 0.9,
    };

    it('preserves LLM fields when parser omits them and LLM is fresh', () => {
        const preferred = {
            validTo: null,
            validFrom: null,
            minSpend: null,
            capValue: null,
            cardName: null,
            termsUrl: null,
            couponCode: null,
        };

        const merged = mergeIngestValidity(existingRow, preferred);

        assert.equal(merged.validTo, '2026-12-31');
        assert.equal(merged.validFrom, '2026-01-01');
        assert.equal(merged.enrichedFields.minSpend, 100);
        assert.equal(merged.enrichedFields.cardName, 'Visa Platinum');
        assert.equal(merged.verifyRequired, false);
        assert.equal(merged.validityStatus, 'active');
        assert.equal(merged.llmIsFresh, true);
    });

    it('parser wins when it supplies valid_to', () => {
        const preferred = {
            validTo: '2027-06-30',
            validFrom: '2026-06-01',
            minSpend: 200,
            capValue: null,
            cardName: null,
            termsUrl: null,
            couponCode: null,
        };

        const merged = mergeIngestValidity(existingRow, preferred);

        assert.equal(merged.validTo, '2027-06-30');
        assert.equal(merged.validFrom, '2026-06-01');
        assert.equal(merged.enrichedFields.minSpend, 200);
    });

    it('does not preserve LLM fields when enrichment is stale', () => {
        const staleRow = {
            ...existingRow,
            llm_enriched_at: '2026-06-20T10:00:00.000Z',
            last_seen_at: '2026-06-27T10:00:00.000Z',
        };

        const merged = mergeIngestValidity(staleRow, {
            validTo: null,
            validFrom: null,
            minSpend: null,
            capValue: null,
            cardName: null,
            termsUrl: null,
            couponCode: null,
        });

        assert.equal(merged.validTo, null);
        assert.equal(merged.verifyRequired, true);
        assert.equal(merged.validityStatus, 'unknown');
        assert.equal(merged.llmIsFresh, false);
    });
});

describe('resolveInsertValidity', () => {
    it('marks new offers without valid_to as verify required', () => {
        const result = resolveInsertValidity({ validTo: null, validFrom: null });
        assert.equal(result.verifyRequired, true);
        assert.equal(result.validityStatus, 'unknown');
    });
});
