import { query } from '../../db/pool.js';
import { productionQuery, isProductionConnected } from '../../db/production-pool.js';
import { getPaymentRecommendation } from '../payment/payment.service.js';
import { getInstrumentsForPayment } from '../wallet/wallet.service.js';
import { findMerchantById } from '../merchants/merchants.service.js';

function mapSession(row) {
    return {
        id: row.id,
        userId: row.user_id,
        merchantId: row.merchant_id,
        requestedAmount: Number(row.requested_amount),
        currency: row.currency,
        selectedCardId: row.selected_card_id,
        selectedCouponId: row.selected_coupon_id,
        loyaltyEnabled: row.loyalty_enabled,
        membershipEnabled: row.membership_enabled,
        sessionType: row.session_type || 'online',
        posId: row.pos_id || null,
        storeId: row.store_id || null,
        pointsRedemptionPct: row.points_redemption_pct != null ? Number(row.points_redemption_pct) : 100,
        productionUserId: row.production_user_id || null,
        productionMerchantUserId: row.production_merchant_user_id || null,
        productionPaymentRequestId: row.production_payment_request_id || null,
        status: row.status,
        confirmedAt: row.confirmed_at || null,
    };
}

export async function createSession(userId, {
    merchantId,
    amount,
    currency = 'AED',
    sessionType = 'online',
    posId = null,
    storeId = null,
    productionUserId = null,
    productionMerchantUserId = null,
}) {
    if (!merchantId || !amount) throw new Error('merchantId and amount are required');
    const merchant = await findMerchantById(merchantId);
    if (!merchant) throw new Error('merchant not found');

    const { rows } = await query(
        `INSERT INTO checkout_sessions
           (user_id, merchant_id, requested_amount, currency, session_type, pos_id, store_id,
            production_user_id, production_merchant_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [userId, merchantId, amount, currency, sessionType, posId, storeId,
            productionUserId, productionMerchantUserId],
    );
    return mapSession(rows[0]);
}

export async function findSession(sessionId, userId) {
    const { rows } = await query(
        'SELECT * FROM checkout_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, userId],
    );
    return rows[0] ? mapSession(rows[0]) : null;
}

export async function updateSessionInstruments(sessionId, userId, patch) {
    const session = await findSession(sessionId, userId);
    if (!session) return null;

    const { rows } = await query(
        `UPDATE checkout_sessions SET
           selected_card_id        = COALESCE($3, selected_card_id),
           selected_coupon_id      = COALESCE($4, selected_coupon_id),
           loyalty_enabled         = COALESCE($5, loyalty_enabled),
           membership_enabled      = COALESCE($6, membership_enabled),
           points_redemption_pct   = COALESCE($7, points_redemption_pct),
           updated_at              = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [
            sessionId,
            userId,
            patch.cardId ?? null,
            patch.couponId ?? null,
            patch.loyaltyEnabled ?? null,
            patch.membershipEnabled ?? null,
            patch.pointsRedemptionPct ?? null,
        ],
    );
    return mapSession(rows[0]);
}

export async function getSessionRecommendation(sessionId, userId, options = {}) {
    const session = await findSession(sessionId, userId);
    if (!session) throw new Error('session not found');

    const merchant = await findMerchantById(session.merchantId);
    if (!merchant) throw new Error('merchant not found');

    // Pass production_user_id so wallet fetches real bank/card data from Supabase
    let instruments = await getInstrumentsForPayment(userId, {
        productionUserId: session.productionUserId,
    });

    if (session.loyaltyEnabled === false) {
        instruments = { ...instruments, loyaltyAccounts: [] };
    }
    if (session.membershipEnabled === false) {
        instruments = { ...instruments, membership: null };
    }

    // Apply points redemption percentage from slider
    if (session.pointsRedemptionPct < 100 && instruments.loyaltyAccounts.length > 0) {
        const pct = session.pointsRedemptionPct / 100;
        instruments = {
            ...instruments,
            loyaltyAccounts: instruments.loyaltyAccounts.map((a) => ({
                ...a,
                balanceCoins: Math.floor(a.balanceCoins * pct),
            })),
        };
    }

    if (session.selectedCardId) {
        instruments = {
            ...instruments,
            cards: instruments.cards.map((c) => ({
                ...c,
                enabled: c.id === session.selectedCardId,
            })),
        };
    }

    if (session.selectedCouponId) {
        instruments = {
            ...instruments,
            coupons: instruments.coupons.map((c) => ({
                ...c,
                enabled: c.id === session.selectedCouponId,
            })),
        };
    } else if (instruments.coupons.length > 1) {
        const [first, ...rest] = instruments.coupons;
        instruments = {
            ...instruments,
            coupons: [{ ...first, enabled: true }, ...rest.map((c) => ({ ...c, enabled: false }))],
        };
    }

    const rawRequest = {
        requestedAmount: session.requestedAmount,
        merchantName: merchant.name,
        merchantCategory: merchant.category,
        merchantMcc: merchant.mcc,
        currency: session.currency,
        userInstruments: instruments,
    };

    const recommendation = await getPaymentRecommendation(rawRequest, options);
    return {
        sessionId: session.id,
        sessionType: session.sessionType,
        merchant,
        pointsRedemptionPct: session.pointsRedemptionPct,
        ...recommendation,
    };
}

/**
 * Buyer presses "Pay Now" — lock the recommendation and create payment_request
 * in production Supabase so Lean/N-Genius gateway flow can proceed.
 */
export async function confirmSession(sessionId, userId) {
    // Atomically claim the session — prevents double-confirm race condition.
    // If two requests arrive simultaneously, only one UPDATE wins; the other
    // sees 0 rows and throws before any money moves.
    const { rows: claimed } = await query(
        `UPDATE checkout_sessions
         SET status = 'confirmed', confirmed_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'open'
         RETURNING *`,
        [sessionId, userId],
    );
    if (!claimed[0]) {
        const exists = await findSession(sessionId, userId);
        if (!exists) throw new Error('session not found');
        throw new Error('session already confirmed or closed');
    }
    const session = mapSession(claimed[0]);

    // Get final recommendation to capture net amount + breakdown.
    // Session is already locked above — recommendation is advisory only at this point.
    const rec = await getSessionRecommendation(sessionId, userId, { skipAI: true });

    const grossAmount = rec.requestedAmount;
    const netAmount = rec.payAmount;
    const breakdown = rec.discountBreakdown || [];

    const loyaltyAed = breakdown.find((d) => d.type === 'loyalty')?.discountAed || 0;
    const couponAed = breakdown.find((d) => d.type === 'coupon')?.discountAed || 0;
    const membershipAed = breakdown.find((d) => d.type === 'membership')?.discountAed || 0;

    let productionPaymentRequestId = null;

    // sellerUserId comes from the session (set at creation), never from the confirm request body.
    // Production payment_requests column names confirmed from db_full_extract.json (2026-06-24):
    //   merchant_user_id (not seller_user_id), payer_user_id (not buyer_user_id),
    //   amount (not amount_aed), status='PAYMENT_INITIATED'
    //   gross_amount_aed, net_amount_aed, loyalty_redeemed_aed, coupon_discount_aed,
    //   membership_discount_aed, discount_breakdown, checkout_session_id are NEW columns
    //   added by the production migration — see backend/docs/production-migration-for-backend-team.sql
    if (isProductionConnected() && session.productionUserId && session.productionMerchantUserId) {
        try {
            const { rows } = await productionQuery(
                `INSERT INTO payment_requests
                   (merchant_user_id, payer_user_id, amount, net_amount_aed, gross_amount_aed,
                    status, loyalty_redeemed_aed, coupon_discount_aed,
                    membership_discount_aed, discount_breakdown, checkout_session_id)
                 VALUES ($1,$2,$3,$4,$5,'PAYMENT_INITIATED',$6,$7,$8,$9,$10)
                 RETURNING id`,
                [
                    session.productionMerchantUserId,
                    session.productionUserId,
                    netAmount,
                    netAmount,
                    grossAmount,
                    loyaltyAed,
                    couponAed,
                    membershipAed,
                    JSON.stringify(breakdown),
                    sessionId,
                ],
            );
            productionPaymentRequestId = rows[0]?.id || null;
        } catch (err) {
            // Unique constraint on checkout_session_id — this session was already inserted
            // (e.g. a prior request succeeded but the response was lost). Fetch the existing row.
            if (err.code === '23505') {
                const { rows } = await productionQuery(
                    `SELECT id FROM payment_requests WHERE checkout_session_id = $1`,
                    [sessionId],
                );
                productionPaymentRequestId = rows[0]?.id || null;
            } else {
                throw err;
            }
        }
    }

    // Store the production payment request ID on the now-confirmed session.
    if (productionPaymentRequestId) {
        await query(
            `UPDATE checkout_sessions SET production_payment_request_id = $2 WHERE id = $1`,
            [sessionId, productionPaymentRequestId],
        );
    }

    return {
        sessionId,
        productionPaymentRequestId,
        grossAmount,
        netAmount,
        totalDiscount: rec.totalDiscount,
        discountBreakdown: breakdown,
        rewardsEarned: rec.rewardsEarned,
        nextStep: productionPaymentRequestId
            ? 'payment_request_created'
            : 'production_not_connected',
    };
}
