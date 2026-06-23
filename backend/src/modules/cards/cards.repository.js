import { query } from '../../db/pool.js';

function rowToProduct(row) {
    return {
        id: row.id,
        bankName: row.bank_name,
        cardNetwork: row.card_network,
        productName: row.product_name,
        rewardRatePerAed: Number(row.reward_rate_per_aed),
        goldMgPerAed: Number(row.gold_mg_per_aed),
        rewardUnit: row.reward_unit,
        sourceUrl: row.source_url,
    };
}

export async function findCardProducts(filters = {}) {
    const clauses = [];
    const params = [];
    let idx = 1;

    if (filters.bank) {
        clauses.push(`bank_name ILIKE $${idx++}`);
        params.push(`%${filters.bank}%`);
    }
    if (filters.network) {
        clauses.push(`card_network ILIKE $${idx++}`);
        params.push(`%${filters.network}%`);
    }
    if (filters.q) {
        clauses.push(`product_name ILIKE $${idx++}`);
        params.push(`%${filters.q}%`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(
        `SELECT * FROM card_products ${where} ORDER BY bank_name, product_name LIMIT 100`,
        params,
    );
    return rows.map(rowToProduct);
}

export async function findCardProductById(id) {
    const { rows } = await query('SELECT * FROM card_products WHERE id = $1', [id]);
    return rows[0] ? rowToProduct(rows[0]) : null;
}
