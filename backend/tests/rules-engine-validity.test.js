import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePaymentCombinations } from '../src/modules/payment/rules-engine.service.js';

describe('rules engine validity gates', () => {
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

    const baseOffer = {
        id: 'offer-1',
        bankName: 'ADCB',
        merchantName: 'Starbucks',
        offerTitle: '10% off',
        discountType: 'percent',
        discountValue: 10,
        freshnessStatus: 'fresh',
        validityStatus: 'active',
        verifyRequired: false,
        validTo: '2026-12-31',
        validFrom: null,
        categories: [],
        eligibleMccList: [],
    };

    function cardOfferDiscount(result) {
        const combo = result.combinations.find((c) =>
            (c.discountBreakdown || []).some((d) => d.type === 'cardOffer'),
        );
        return combo?.totalDiscount || 0;
    }

    it('excludes verify_required offers', () => {
        const result = evaluatePaymentCombinations(baseCtx, [{
            ...baseOffer,
            verifyRequired: true,
        }]);
        assert.equal(cardOfferDiscount(result), 0);
    });

    it('excludes unknown validity offers', () => {
        const result = evaluatePaymentCombinations(baseCtx, [{
            ...baseOffer,
            validityStatus: 'unknown',
            verifyRequired: true,
        }]);
        assert.equal(cardOfferDiscount(result), 0);
    });

    it('excludes not_yet_active offers', () => {
        const result = evaluatePaymentCombinations(baseCtx, [{
            ...baseOffer,
            validityStatus: 'not_yet_active',
            validFrom: '2030-01-01',
        }]);
        assert.equal(cardOfferDiscount(result), 0);
    });

    it('excludes offers with future valid_from even when status is active', () => {
        const result = evaluatePaymentCombinations(baseCtx, [{
            ...baseOffer,
            validFrom: '2030-01-01',
        }]);
        assert.equal(cardOfferDiscount(result), 0);
    });

    it('applies verified active offers', () => {
        const result = evaluatePaymentCombinations(baseCtx, [baseOffer]);
        assert.ok(cardOfferDiscount(result) > 0);
    });
});
