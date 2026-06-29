import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, isRetryableError } from '../src/modules/enrichment/offer-llm-enrichment.service.js';

describe('offer LLM enrichment retry', () => {
    it('identifies retryable errors', () => {
        assert.equal(isRetryableError({ status: 429 }), true);
        assert.equal(isRetryableError({ status: 503 }), true);
        assert.equal(isRetryableError(new Error('Enrichment request timed out')), true);
        assert.equal(isRetryableError({ status: 400 }), false);
    });

    it('retries retryable failures with exponential backoff', async () => {
        let attempts = 0;
        const result = await withRetry(async () => {
            attempts += 1;
            if (attempts < 3) {
                const err = new Error('rate limit');
                err.status = 429;
                throw err;
            }
            return 'ok';
        }, { maxAttempts: 3, baseDelayMs: 1 });

        assert.equal(result, 'ok');
        assert.equal(attempts, 3);
    });

    it('does not retry non-retryable failures', async () => {
        let attempts = 0;
        await assert.rejects(() => withRetry(async () => {
            attempts += 1;
            const err = new Error('bad request');
            err.status = 400;
            throw err;
        }, { maxAttempts: 3, baseDelayMs: 1 }));

        assert.equal(attempts, 1);
    });
});
