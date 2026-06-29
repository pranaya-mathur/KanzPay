/**
 * @file payment.service.js
 * Orchestrates the three-layer payment recommendation pipeline:
 *   Normalization → Rules Engine → AI Recommendation
 */

import { normalizePaymentRequest } from './normalization.service.js';
import { evaluatePaymentCombinations, buildInstrumentSelection } from './rules-engine.service.js';
import { getAIRecommendation, isAIEnabled } from './ai-recommendation.service.js';
import { fetchApplicableOffersWithCoupons, mergeCouponInstruments } from './offer-fetch.service.js';
import { reviewEligibility, reviewEligibilityWithLlm } from './eligibility-reviewer.service.js';
import logger from '../../shared/utils/logger.js';

/**
 * Main entry point: take a raw payment request and return an AI-powered
 * recommendation with full discount breakdown.
 */
export async function getPaymentRecommendation(rawRequest, options = {}) {
    const ctx = normalizePaymentRequest(rawRequest);

    logger.info('Payment recommendation requested', {
        merchant: ctx.merchantName,
        amount: ctx.requestedAmount,
        cards: ctx.instruments.cards.length,
        banks: ctx.instruments.banks.length,
        loyalty: ctx.instruments.loyaltyAccounts.length,
        coupons: ctx.instruments.coupons.length,
    });

    const { dbOffers, crawledCoupons, applicableOffersMeta } = await fetchApplicableOffersWithCoupons(ctx);

    const mergedCoupons = mergeCouponInstruments(ctx.instruments.coupons, crawledCoupons);
    const ctxWithCoupons = {
        ...ctx,
        instruments: {
            ...ctx.instruments,
            coupons: mergedCoupons.map(({ offerId, verifyRequired, source, ...c }) => c),
        },
    };

    const combinationsResult = evaluatePaymentCombinations(ctxWithCoupons, dbOffers);
    const instrumentSelection = buildInstrumentSelection(ctxWithCoupons, combinationsResult);
    const best = combinationsResult.bestCombination;

    const eligibility = options.skipAI
        ? reviewEligibility(ctxWithCoupons, best, applicableOffersMeta, mergedCoupons)
        : await reviewEligibilityWithLlm(ctxWithCoupons, best, applicableOffersMeta, {
            mergedCoupons,
            skipAI: options.skipAI,
        });

    let recommendation;
    if (options.skipAI || !isAIEnabled()) {
        logger.info('AI disabled or skipped, using rules engine result');
        recommendation = {
            aiPowered: false,
            fallback: true,
            recommendedCombination: best,
            allCombinations: combinationsResult.combinations,
            summary: best
                ? `Pay ${ctx.currency} ${best.payAmount} — save ${ctx.currency} ${best.totalDiscount}`
                : 'No savings available for this transaction.',
            explanation: null,
            savingsHighlight: best ? `Save ${ctx.currency} ${best.totalDiscount}` : null,
            rewardsHighlight: null,
            caveats: eligibility.caveats,
        };
    } else {
        recommendation = await getAIRecommendation(ctxWithCoupons, combinationsResult, { model: options.model });
        if (eligibility.caveats.length) {
            recommendation.caveats = [...new Set([
                ...(recommendation.caveats || []),
                ...eligibility.caveats,
            ])];
        }
    }

    const recommendedInstruments = buildRecommendedInstruments(best, ctxWithCoupons);

    return {
        requestedAmount: ctx.requestedAmount,
        currency: ctx.currency,
        merchantName: ctx.merchantName,
        recommendation,
        discountBreakdown: best?.discountBreakdown || [],
        totalDiscount: best?.totalDiscount || 0,
        payAmount: best?.payAmount || ctx.requestedAmount,
        rewardsEarned: best?.rewardsEarned || {},
        loyaltyEarned: best?.loyaltyEarned || {},
        instrumentSelection,
        recommendedInstruments,
        combinationsCount: combinationsResult.totalCombinationsEvaluated,
        applicableOffersFound: dbOffers.length + crawledCoupons.length,
        applicableOffers: applicableOffersMeta,
        eligibilityReview: eligibility.eligibilityReview,
        disclaimer: crawledCoupons.some((c) => c.verifyRequired) || eligibility.caveats.length
            ? 'Some offers are from public sources — verify eligibility before paying.'
            : null,
    };
}

function buildRecommendedInstruments(best, ctx) {
    if (!best) return null;
    const breakdown = best.discountBreakdown || [];
    return {
        loyalty: breakdown.some((d) => d.type === 'loyalty') ? { enabled: true } : { enabled: false },
        coupon: breakdown.some((d) => d.type === 'coupon')
            ? { enabled: true, label: breakdown.find((d) => d.type === 'coupon')?.label }
            : { enabled: false },
        membership: breakdown.some((d) => d.type === 'membership')
            ? { enabled: true, tier: ctx.instruments.membership?.tier }
            : { enabled: false },
        card: best.card ? { enabled: true, id: best.card.id, bankName: best.card.bankName } : null,
        bank: best.bank ? { enabled: true, id: best.bank.id, bankName: best.bank.bankName } : null,
    };
}
