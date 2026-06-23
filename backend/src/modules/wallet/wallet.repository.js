import { query } from '../../db/pool.js';
import { findCardProductById } from '../cards/cards.repository.js';

export async function getWalletInstruments(userId) {
    const [loyalty, coupons, membership, cards, banks] = await Promise.all([
        query('SELECT * FROM user_loyalty_accounts WHERE user_id = $1 ORDER BY created_at', [userId]),
        query('SELECT * FROM user_coupons WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
        query('SELECT * FROM user_memberships WHERE user_id = $1 LIMIT 1', [userId]),
        query('SELECT * FROM user_cards WHERE user_id = $1 ORDER BY created_at', [userId]),
        query('SELECT * FROM user_banks WHERE user_id = $1 ORDER BY created_at', [userId]),
    ]);

    return {
        loyaltyAccounts: loyalty.rows.map(mapLoyalty),
        coupons: coupons.rows.map(mapCoupon),
        membership: membership.rows[0] ? mapMembership(membership.rows[0]) : null,
        cards: cards.rows.map(mapCard),
        banks: banks.rows.map(mapBank),
    };
}

function mapLoyalty(row) {
    return {
        id: row.id,
        programName: row.program_name,
        balanceCoins: Number(row.balance_coins),
        conversionRate: Number(row.conversion_rate),
        earnRatePerAed: Number(row.earn_rate_per_aed),
        maxRedeemableCoins: row.max_redeemable_coins != null ? Number(row.max_redeemable_coins) : null,
        enabled: row.enabled,
    };
}

function mapCoupon(row) {
    return {
        id: row.id,
        code: row.code,
        programName: row.program_name,
        discountType: row.discount_type,
        discountValue: Number(row.discount_value),
        minSpend: row.min_spend != null ? Number(row.min_spend) : null,
        maxDiscount: row.max_discount != null ? Number(row.max_discount) : null,
        expiresAt: row.expires_at,
        enabled: row.enabled,
        source: row.source,
    };
}

function mapMembership(row) {
    return {
        id: row.id,
        tier: row.tier,
        programName: row.program_name,
        discountPercent: Number(row.discount_percent),
        enabled: row.enabled,
    };
}

function mapCard(row) {
    return {
        id: row.id,
        bankName: row.bank_name,
        cardNetwork: row.card_network,
        cardType: row.card_type,
        lastFour: row.last_four,
        cardProductId: row.card_product_id,
        rewardRatePerAed: row.reward_rate_per_aed != null ? Number(row.reward_rate_per_aed) : 0,
        goldMgPerAed: row.gold_mg_per_aed != null ? Number(row.gold_mg_per_aed) : 0,
        rewardUnit: row.reward_unit || 'points',
        enabled: row.enabled,
    };
}

function mapBank(row) {
    return {
        id: row.id,
        bankName: row.bank_name,
        accountNo: row.account_no,
        enabled: row.enabled,
    };
}

export async function addCard(userId, data) {
    let rewardRate = data.rewardRatePerAed;
    let goldMg = data.goldMgPerAed;
    let rewardUnit = data.rewardUnit;

    if (data.cardProductId) {
        const product = await findCardProductById(data.cardProductId);
        if (product) {
            rewardRate = product.rewardRatePerAed;
            goldMg = product.goldMgPerAed;
            rewardUnit = product.rewardUnit;
        }
    }

    const { rows } = await query(
        `INSERT INTO user_cards (user_id, bank_name, card_network, card_type, last_four, card_product_id, reward_rate_per_aed, gold_mg_per_aed, reward_unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [userId, data.bankName, data.cardNetwork, data.cardType || 'credit', data.lastFour || null,
            data.cardProductId || null, rewardRate ?? 0, goldMg ?? 0, rewardUnit || 'points'],
    );
    return mapCard(rows[0]);
}

export async function deleteCard(userId, cardId) {
    const { rowCount } = await query('DELETE FROM user_cards WHERE id = $1 AND user_id = $2', [cardId, userId]);
    return rowCount > 0;
}

export async function addCoupon(userId, data) {
    const { rows } = await query(
        `INSERT INTO user_coupons (user_id, code, program_name, discount_type, discount_value, min_spend, max_discount, expires_at, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'wallet')
         ON CONFLICT (user_id, code) DO UPDATE SET
           program_name = EXCLUDED.program_name,
           discount_type = EXCLUDED.discount_type,
           discount_value = EXCLUDED.discount_value,
           min_spend = EXCLUDED.min_spend,
           max_discount = EXCLUDED.max_discount,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
         RETURNING *`,
        [userId, data.code.toUpperCase(), data.programName || null, data.discountType || 'percent',
            data.discountValue ?? 0, data.minSpend ?? null, data.maxDiscount ?? null, data.expiresAt ?? null],
    );
    return mapCoupon(rows[0]);
}

export async function deleteCoupon(userId, couponId) {
    const { rowCount } = await query('DELETE FROM user_coupons WHERE id = $1 AND user_id = $2', [couponId, userId]);
    return rowCount > 0;
}

export async function replaceLoyaltyAccounts(userId, accounts = []) {
    await query('DELETE FROM user_loyalty_accounts WHERE user_id = $1', [userId]);
    const results = [];
    for (const data of accounts) {
        const { rows } = await query(
            `INSERT INTO user_loyalty_accounts (user_id, program_name, balance_coins, conversion_rate, earn_rate_per_aed, max_redeemable_coins)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [userId, data.programName, data.balanceCoins ?? 0, data.conversionRate ?? 100,
                data.earnRatePerAed ?? 0, data.maxRedeemableCoins ?? null],
        );
        results.push(mapLoyalty(rows[0]));
    }
    return results;
}

export async function upsertMembership(userId, data) {
    const { rows } = await query(
        `INSERT INTO user_memberships (user_id, tier, program_name, discount_percent, enabled)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id) DO UPDATE SET
           tier = EXCLUDED.tier,
           program_name = EXCLUDED.program_name,
           discount_percent = EXCLUDED.discount_percent,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()
         RETURNING *`,
        [userId, data.tier || 'STANDARD', data.programName || 'Privilege Club', data.discountPercent ?? 0, data.enabled !== false],
    );
    return mapMembership(rows[0]);
}

export async function addBank(userId, data) {
    const { rows } = await query(
        `INSERT INTO user_banks (user_id, bank_name, account_no) VALUES ($1,$2,$3) RETURNING *`,
        [userId, data.bankName, data.accountNo || null],
    );
    return mapBank(rows[0]);
}

export async function deleteBank(userId, bankId) {
    const { rowCount } = await query('DELETE FROM user_banks WHERE id = $1 AND user_id = $2', [bankId, userId]);
    return rowCount > 0;
}

/** Shape for payment normalization.service userInstruments */
export function toUserInstruments(wallet) {
    return {
        loyaltyAccounts: wallet.loyaltyAccounts.map(({ id, ...rest }) => rest),
        coupons: wallet.coupons.map((c) => ({
            id: c.id,
            code: c.code,
            programName: c.programName,
            discountType: c.discountType,
            discountValue: c.discountValue,
            minSpend: c.minSpend,
            maxDiscount: c.maxDiscount,
            enabled: c.enabled,
        })),
        membership: wallet.membership
            ? { tier: wallet.membership.tier, programName: wallet.membership.programName, discountPercent: wallet.membership.discountPercent, enabled: wallet.membership.enabled }
            : null,
        cards: wallet.cards.map((c) => ({
            id: c.id,
            bankName: c.bankName,
            cardNetwork: c.cardNetwork,
            cardType: c.cardType,
            lastFour: c.lastFour,
            rewardRatePerAed: c.rewardRatePerAed,
            goldMgPerAed: c.goldMgPerAed,
            rewardUnit: c.rewardUnit,
            enabled: c.enabled,
        })),
        banks: wallet.banks.map((b) => ({ id: b.id, bankName: b.bankName, accountNo: b.accountNo, enabled: b.enabled })),
    };
}
