import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCouponInstruments, resolveVerifyRequired } from '../src/modules/payment/offer-fetch.service.js';

describe('resolveVerifyRequired', () => {
    it('returns true when offer.verifyRequired is set', () => {
        assert.equal(resolveVerifyRequired({ verifyRequired: true, confidence: 0.9 }), true);
    });

    it('returns true when validity is unknown', () => {
        assert.equal(resolveVerifyRequired({ validityStatus: 'unknown', confidence: 0.9 }), true);
    });

    it('returns true for low-confidence crawled offers', () => {
        assert.equal(resolveVerifyRequired({ confidence: 0.5 }), true);
    });

    it('returns false for high-confidence verified offers', () => {
        assert.equal(resolveVerifyRequired({
            verifyRequired: false,
            validityStatus: 'active',
            confidence: 0.9,
        }), false);
    });
});

describe('mergeCouponInstruments', () => {
    it('wallet coupons override crawled duplicates', () => {
        const wallet = [{ code: 'SAVE10', discountValue: 10, discountType: 'percent', enabled: true }];
        const crawled = [{ code: 'SAVE10', discountValue: 5, discountType: 'percent', enabled: true, source: 'crawled' }];
        const merged = mergeCouponInstruments(wallet, crawled);
        assert.equal(merged.length, 1);
        assert.equal(merged[0].source, 'wallet');
        assert.equal(merged[0].discountValue, 10);
    });

    it('merges distinct wallet and crawled coupons', () => {
        const wallet = [{ code: 'WALLET1', discountValue: 10, discountType: 'percent' }];
        const crawled = [{ code: 'CRAWL1', discountValue: 15, discountType: 'percent', source: 'crawled' }];
        const merged = mergeCouponInstruments(wallet, crawled);
        assert.equal(merged.length, 2);
        const codes = merged.map((c) => c.code).sort();
        assert.deepEqual(codes, ['CRAWL1', 'WALLET1']);
    });
});
