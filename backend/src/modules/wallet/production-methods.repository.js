/**
 * Fetches payment methods from production Supabase Users DB.
 * Maps user_payment_methods → same shape as local user_banks / user_cards
 * so the recommendation engine works without changes.
 */
import { productionQuery, isProductionConnected } from '../../db/production-pool.js';

export async function getProductionPaymentMethods(productionUserId) {
    if (!isProductionConnected() || !productionUserId) return { banks: [], cards: [] };

    // Production user_payment_methods uses flat columns (no provider_data JSONB).
    // Actual columns confirmed from db_full_extract.json (2026-06-24):
    //   type (BANK|CARD), bank_name, display_name, last4, card_brand,
    //   lean_customer_id, lean_payment_source_id, lean_account_id,
    //   ngenius_token, ngenius_card_token, is_default, status
    const { rows } = await productionQuery(
        `SELECT id, user_id, type, display_name, bank_name, last4, card_brand,
                lean_customer_id, lean_payment_source_id, lean_account_id,
                ngenius_token, ngenius_card_token, is_default, status
         FROM user_payment_methods
         WHERE user_id = $1 AND status = 'ACTIVE'
         ORDER BY is_default DESC, created_at ASC`,
        [productionUserId],
    );

    const banks = [];
    const cards = [];

    for (const row of rows) {
        const rowType = (row.type || '').toUpperCase();

        if (rowType === 'BANK') {
            banks.push({
                id: row.id,
                bankName: row.bank_name || row.display_name || 'Bank',
                accountNo: row.lean_account_id || null,
                leanCustomerId: row.lean_customer_id || null,
                leanDestinationId: row.lean_payment_source_id || null,
                isDefault: row.is_default,
                provider: 'lean',
                enabled: true,
                source: 'production',
            });
        } else if (rowType === 'CARD') {
            cards.push({
                id: row.id,
                bankName: row.bank_name || row.display_name || 'Card',
                cardNetwork: row.card_brand || 'Unknown',
                cardType: 'credit',
                lastFour: row.last4 || null,
                ngeniusToken: row.ngenius_card_token || row.ngenius_token || null,
                rewardRatePerAed: 0,
                goldMgPerAed: 0,
                rewardUnit: 'points',
                isDefault: row.is_default,
                provider: 'ngenius',
                enabled: true,
                source: 'production',
            });
        }
    }

    const cleanBanks = banks.filter((b) => b.id);

    return { banks: cleanBanks, cards };
}
