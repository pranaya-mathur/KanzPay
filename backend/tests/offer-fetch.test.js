import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCouponInstruments } from '../src/modules/payment/offer-fetch.service.js';

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
