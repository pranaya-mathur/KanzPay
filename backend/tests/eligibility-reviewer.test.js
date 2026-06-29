import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reviewEligibility } from '../src/modules/payment/eligibility-reviewer.service.js';

describe('reviewEligibility', () => {
    const ctx = { requestedAmount: 200, merchantName: 'Starbucks' };

    it('returns no caveat for verified card offer in combination', () => {
        const best = {
            payAmount: 180,
            totalDiscount: 20,
            discountBreakdown: [{
                type: 'cardOffer',
                label: '10% off at Starbucks',
                discountAed: 20,
            }],
        };
        const meta = [{
            offerId: 'o1',
            type: 'card_offer',
            title: '10% off at Starbucks',
            verifyRequired: false,
            validityStatus: 'active',
            confidence: 0.9,
        }];

        const result = reviewEligibility(ctx, best, meta, []);
        assert.equal(result.risk, 'low');
        assert.equal(result.caveats.length, 0);
        assert.equal(result.eligibilityReview, null);
    });

    it('adds caveat when verify_required offer is in combination', () => {
        const best = {
            payAmount: 180,
            totalDiscount: 20,
            discountBreakdown: [{
                type: 'cardOffer',
                label: '10% off at Starbucks',
                discountAed: 20,
            }],
        };
        const meta = [{
            offerId: 'o1',
            type: 'card_offer',
            title: '10% off at Starbucks',
            verifyRequired: true,
            validityStatus: 'active',
            confidence: 0.9,
        }];

        const result = reviewEligibility(ctx, best, meta, []);
        assert.ok(result.caveats.some((c) => c.includes('verified on the bank website')));
        assert.equal(result.eligibilityReview?.risk, 'medium');
    });

    it('does not flag unrelated low-confidence offers outside combination', () => {
        const best = {
            payAmount: 180,
            totalDiscount: 20,
            discountBreakdown: [{
                type: 'cardOffer',
                label: '10% off at Starbucks',
                discountAed: 20,
            }],
        };
        const meta = [
            {
                offerId: 'o1',
                type: 'card_offer',
                title: '10% off at Starbucks',
                verifyRequired: false,
                validityStatus: 'active',
                confidence: 0.9,
            },
            {
                offerId: 'o2',
                type: 'card_offer',
                title: 'Unrelated expired promo',
                verifyRequired: false,
                validityStatus: 'expired',
                confidence: 0.4,
            },
        ];

        const result = reviewEligibility(ctx, best, meta, []);
        assert.equal(result.risk, 'low');
        assert.equal(result.caveats.length, 0);
    });

    it('extracts coupon code from parentheses in label', () => {
        const best = {
            payAmount: 180,
            totalDiscount: 20,
            discountBreakdown: [{
                type: 'coupon',
                label: 'Summer promo (SAVE20)',
                discountAed: 20,
            }],
        };
        const mergedCoupons = [{
            code: 'SAVE20',
            verifyRequired: true,
            expiresAt: '2030-01-01',
            discountType: 'percent',
            discountValue: 10,
        }];

        const result = reviewEligibility(ctx, best, [], mergedCoupons);
        assert.ok(result.caveats.some((c) => c.includes('SAVE20')));
    });
});
