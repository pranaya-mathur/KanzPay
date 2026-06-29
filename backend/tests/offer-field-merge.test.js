import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeEnrichmentIntoOffer, hasBlockingEnrichmentFlags } from '../src/modules/enrichment/offer-field-merge.service.js';

describe('mergeEnrichmentIntoOffer', () => {
    const existing = {
        validFrom: null,
        validTo: null,
        minSpend: null,
        capValue: null,
        cardName: null,
        couponCode: null,
        termsUrl: null,
        bankName: 'ADCB',
        merchantName: 'Starbucks',
        discountValue: '10',
        verifyRequired: true,
        llmEnrichment: {},
    };

    it('fills null fields when LLM provides values with evidence', () => {
        const { patch } = mergeEnrichmentIntoOffer(existing, {
            valid_to: '2026-12-31',
            min_spend: 100,
            confidence: 0.9,
            evidence: [
                { field: 'valid_to', quote: 'Valid until 31 Dec 2026' },
                { field: 'min_spend', quote: 'Minimum spend AED 100' },
            ],
            flags: [],
        });

        assert.equal(patch.validTo, '2026-12-31');
        assert.equal(patch.minSpend, 100);
        assert.equal(patch.verifyRequired, false);
        assert.equal(patch.validityStatus, 'active');
    });

    it('does not overwrite existing values without high confidence evidence', () => {
        const withDates = { ...existing, validTo: '2026-08-01' };
        const { patch } = mergeEnrichmentIntoOffer(withDates, {
            valid_to: '2026-12-31',
            confidence: 0.7,
            evidence: [{ field: 'valid_to', quote: 'Valid until 31 Dec 2026' }],
            flags: [],
        });

        assert.equal(patch.validTo, undefined);
    });

    it('overwrites when confidence high and evidence present', () => {
        const withDates = { ...existing, validTo: '2026-08-01' };
        const { patch } = mergeEnrichmentIntoOffer(withDates, {
            valid_to: '2026-12-31',
            confidence: 0.9,
            evidence: [{ field: 'valid_to', quote: 'Valid until 31 Dec 2026' }],
            flags: [],
        });

        assert.equal(patch.validTo, '2026-12-31');
    });
});

describe('hasBlockingEnrichmentFlags', () => {
    it('detects blocking flags', () => {
        assert.equal(hasBlockingEnrichmentFlags(['generic_page']), true);
        assert.equal(hasBlockingEnrichmentFlags(['missing_dates']), false);
    });
});
