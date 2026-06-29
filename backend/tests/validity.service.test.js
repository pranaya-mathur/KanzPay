import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveValidityStatus, shouldRequireVerification } from '../src/modules/ingestion/validity.service.js';

describe('deriveValidityStatus', () => {
    const now = new Date('2026-06-29');

    it('returns expired when valid_to is in the past', () => {
        assert.equal(
            deriveValidityStatus({ validTo: '2026-06-27', verifyRequired: false }, now),
            'expired',
        );
    });

    it('returns not_yet_active when valid_from is in the future', () => {
        assert.equal(
            deriveValidityStatus({ validFrom: '2026-07-01', verifyRequired: false }, now),
            'not_yet_active',
        );
    });

    it('returns unknown when valid_to missing and verify_required', () => {
        assert.equal(
            deriveValidityStatus({ validTo: null, verifyRequired: true }, now),
            'unknown',
        );
    });

    it('returns active when valid_to is in the future', () => {
        assert.equal(
            deriveValidityStatus({ validTo: '2026-12-31', verifyRequired: false }, now),
            'active',
        );
    });
});

describe('shouldRequireVerification', () => {
    it('requires verification when valid_to is missing', () => {
        assert.equal(shouldRequireVerification({ validTo: null, llmConfidence: 0.9 }), true);
    });

    it('requires verification when valid_to is missing and confidence low', () => {
        assert.equal(shouldRequireVerification({ validTo: null, llmConfidence: 0.5 }), true);
    });

    it('requires verification when valid_to is missing and no LLM confidence', () => {
        assert.equal(shouldRequireVerification({ validTo: null, llmConfidence: null }), true);
    });

    it('does not require verification when valid_to is set and confidence high', () => {
        assert.equal(shouldRequireVerification({ validTo: '2026-12-31', llmConfidence: 0.9 }), false);
    });

    it('requires verification when valid_to is set but confidence low', () => {
        assert.equal(shouldRequireVerification({ validTo: '2026-12-31', llmConfidence: 0.5 }), true);
    });
});
