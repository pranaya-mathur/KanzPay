import { query } from '../../db/pool.js';
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
        status: row.status,
    };
}

export async function createSession(userId, { merchantId, amount, currency = 'AED' }) {
    if (!merchantId || !amount) throw new Error('merchantId and amount are required');
    const merchant = await findMerchantById(merchantId);
    if (!merchant) throw new Error('merchant not found');

    const { rows } = await query(
        `INSERT INTO checkout_sessions (user_id, merchant_id, requested_amount, currency)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [userId, merchantId, amount, currency],
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
           selected_card_id = COALESCE($3, selected_card_id),
           selected_coupon_id = COALESCE($4, selected_coupon_id),
           loyalty_enabled = COALESCE($5, loyalty_enabled),
           membership_enabled = COALESCE($6, membership_enabled),
           updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [
            sessionId,
            userId,
            patch.cardId ?? null,
            patch.couponId ?? null,
            patch.loyaltyEnabled ?? null,
            patch.membershipEnabled ?? null,
        ],
    );
    return mapSession(rows[0]);
}

export async function getSessionRecommendation(sessionId, userId, options = {}) {
    const session = await findSession(sessionId, userId);
    if (!session) throw new Error('session not found');

    const merchant = await findMerchantById(session.merchantId);
    if (!merchant) throw new Error('merchant not found');

    let instruments = await getInstrumentsForPayment(userId);

    if (session.loyaltyEnabled === false) {
        instruments = { ...instruments, loyaltyAccounts: [] };
    }
    if (session.membershipEnabled === false) {
        instruments = { ...instruments, membership: null };
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
        // Only enable first coupon by default when none selected
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
        merchant,
        ...recommendation,
    };
}
