/**
 * @file payment.controller.js
 * HTTP handlers for the payment recommendation API.
 */

import { getPaymentRecommendation } from './payment.service.js';
import logger from '../../shared/utils/logger.js';

/**
 * POST /payment/recommend
 *
 * Body:
 * {
 *   requestedAmount: 200,
 *   merchantName: "ABC Enterprises Al Reem Island",
 *   merchantMcc: "5411",          // optional
 *   merchantCategory: "grocery",  // optional
 *   currency: "AED",              // optional, defaults to AED
 *   userInstruments: {
 *     loyaltyAccounts: [
 *       { programName: "ABC Loyalty Rewards", balance: 4000, conversionRate: 100 }
 *     ],
 *     cards: [
 *       { bankName: "ADCB", cardNetwork: "Visa", lastFour: "2323", rewardRatePerAed: 2, goldMgPerAed: 0.01 },
 *       { bankName: "FAB",  cardNetwork: "Mastercard", lastFour: "2323", rewardRatePerAed: 1 }
 *     ],
 *     coupons: [
 *       { code: "URND23#@NDAKJN%#NDA123", programName: "Silver coupon by Zoomba", discountType: "percent", discountValue: 10 }
 *     ],
 *     membership: {
 *       tier: "GOLD", programName: "Privilege Club", discountPercent: 10
 *     }
 *   }
 * }
 */
export async function recommend(req, res, next) {
    try {
        const skipAI = req.query.skipAI === 'true' || req.query.skipAI === '1';
        const model = req.query.model || undefined;

        const result = await getPaymentRecommendation(req.body, { skipAI, model });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        if (err.message?.includes('must be') || err.message?.includes('required')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        logger.error('Payment recommendation error', { error: err.message });
        return next(err);
    }
}

/**
 * GET /payment/health
 * Quick liveness check for the payment module.
 */
export async function paymentHealth(req, res) {
    const { isAIEnabled } = await import('./ai-recommendation.service.js');
    return res.status(200).json({
        success: true,
        module: 'payment',
        aiEnabled: isAIEnabled(),
    });
}
