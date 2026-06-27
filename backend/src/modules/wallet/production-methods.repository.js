/**
 * Fetches payment methods from production Supabase Users DB.
 * Maps user_payment_methods → same shape as local user_banks / user_cards
 * so the recommendation engine works without changes.
 */
import { productionQuery, isProductionConnected } from '../../db/production-pool.js';

export async function getProductionPaymentMethods(productionUserId) {
    if (!isProductionConnected() || !productionUserId) return { banks: [], cards: [] };

    const { rows } = await productionQuery(
        `SELECT id, user_id, type, provider, provider_data, is_default, status
         FROM user_payment_methods
         WHERE user_id = $1 AND status = 'ACTIVE'
         ORDER BY is_default DESC, created_at ASC`,
        [productionUserId],
    );

    const banks = [];
    const cards = [];

    for (const row of rows) {
        const data = row.provider_data || {};

        if (row.type === 'bank') {
            banks.push({
                id: row.id,
                bankName: data.bankName || data.bank_name || 'Bank',
                accountNo: data.destinationId || data.destination_id || null,
                leanCustomerId: data.customerId || data.customer_id || null,
                leanDestinationId: data.destinationId || data.destination_id || null,
                isDefault: row.is_default,
                provider: row.provider,
                enabled: true,
                source: 'production',
            });
        } else if (row.type === 'card') {
            banks.push({});  // reset
            cards.push({
                id: row.id,
                bankName: data.bankName || data.bank_name || 'Card',
                cardNetwork: data.cardBrand || data.card_brand || 'Unknown',
                cardType: data.cardType || data.card_type || 'credit',
                lastFour: data.last4 || data.lastFour || null,
                ngeniusToken: data.ngeniusCardToken || data.ngenius_card_token || null,
                rewardRatePerAed: 0,
                goldMgPerAed: 0,
                rewardUnit: 'points',
                isDefault: row.is_default,
                provider: row.provider,
                enabled: true,
                source: 'production',
            });
        }
    }

    // Remove the stray empty object pushed during card processing
    const cleanBanks = banks.filter((b) => b.id);

    return { banks: cleanBanks, cards };
}
