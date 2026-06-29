import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfferEnrichmentResult } from '../src/modules/enrichment/offer-enrichment.schema.js';
import { evaluatePaymentCombinations } from '../src/modules/payment/rules-engine.service.js';

describe('parseOfferEnrichmentResult', () => {
    it('parses valid enrichment JSON', () => {
        const result = parseOfferEnrichmentResult({
            valid_to: '2026-12-31',
            min_spend: 50,
            confidence: 0.8,
            evidence: [{ field: 'valid_to', quote: 'Until 31 Dec 2026' }],
            flags: [],
        });
        assert.equal(result.valid_to, '2026-12-31');
        assert.equal(result.min_spend, 50);
    });

    it('rejects invalid confidence', () => {
        assert.throws(() => parseOfferEnrichmentResult({
            confidence: 1.5,
            evidence: [],
        }));
    });
});

describe('coupon expiry in payment combinations', () => {
    const baseCtx = {
        requestedAmount: 200,
        merchantName: 'Starbucks',
        merchantMcc: null,
        merchantCategory: null,
        currency: 'AED',
        instruments: {
            loyaltyAccounts: [],
            cards: [{
                id: 'card1',
                bankName: 'ADCB',
                cardNetwork: 'Visa',
                cardType: 'credit',
                rewardRatePerAed: 1,
                goldMgPerAed: 0,
                enabled: true,
            }],
            banks: [],
            coupons: [],
            membership: null,
        },
    };

    it('excludes expired wallet coupons from discount', () => {
        const ctx = {
            ...baseCtx,
            instruments: {
                ...baseCtx.instruments,
                coupons: [{
                    code: 'EXPIRED10',
                    discountType: 'percent',
                    discountValue: 10,
                    expiresAt: '2020-01-01',
                    enabled: true,
                }],
            },
        };

        const result = evaluatePaymentCombinations(ctx, []);
        const withCouponDiscount = result.combinations.filter((c) =>
            (c.discountBreakdown || []).some((d) => d.type === 'coupon'),
        );
        assert.equal(withCouponDiscount.length, 0);
    });

    it('applies valid coupons', () => {
        const ctx = {
            ...baseCtx,
            instruments: {
                ...baseCtx.instruments,
                coupons: [{
                    code: 'SAVE10',
                    discountType: 'percent',
                    discountValue: 10,
                    expiresAt: '2030-01-01',
                    enabled: true,
                }],
            },
        };

        const result = evaluatePaymentCombinations(ctx, []);
        const withCoupon = result.combinations.find((c) =>
            (c.discountBreakdown || []).some((d) => d.type === 'coupon'),
        );
        assert.ok(withCoupon);
        assert.ok(withCoupon.totalDiscount > 0);
    });
});
