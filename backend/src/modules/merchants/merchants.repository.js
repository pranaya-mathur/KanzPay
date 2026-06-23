import crypto from 'crypto';
import { query } from '../../db/pool.js';

function mapMerchant(row) {
    return {
        id: row.id,
        name: row.name,
        category: row.category,
        mcc: row.mcc,
        qrCode: row.qr_code,
        status: row.status,
    };
}

export async function createMerchant({ name, category, mcc }) {
    const qrCode = crypto.randomBytes(8).toString('hex');
    const { rows } = await query(
        `INSERT INTO merchants (name, category, mcc, qr_code) VALUES ($1,$2,$3,$4) RETURNING *`,
        [name, category || null, mcc || null, qrCode],
    );
    return mapMerchant(rows[0]);
}

export async function findMerchantById(id) {
    const { rows } = await query('SELECT * FROM merchants WHERE id = $1', [id]);
    return rows[0] ? mapMerchant(rows[0]) : null;
}

export async function findMerchantByQr(qrCode) {
    const { rows } = await query('SELECT * FROM merchants WHERE qr_code = $1', [qrCode]);
    return rows[0] ? mapMerchant(rows[0]) : null;
}

export async function addAlias(merchantId, alias) {
    const { rows } = await query(
        `INSERT INTO merchant_aliases (merchant_id, alias) VALUES ($1,$2)
         ON CONFLICT (alias) DO NOTHING RETURNING *`,
        [merchantId, alias],
    );
    return rows[0];
}

export async function resolveMerchantSearchTerms(merchantName) {
    const terms = new Set([merchantName]);
    const { rows } = await query(
        `SELECT m.name, ma.alias FROM merchants m
         LEFT JOIN merchant_aliases ma ON ma.merchant_id = m.id
         WHERE m.name ILIKE $1 OR ma.alias ILIKE $1`,
        [`%${merchantName}%`],
    );
    for (const row of rows) {
        if (row.name) terms.add(row.name);
        if (row.alias) terms.add(row.alias);
    }
    return [...terms];
}

export async function listMerchants() {
    const { rows } = await query('SELECT * FROM merchants ORDER BY name LIMIT 100');
    return rows.map(mapMerchant);
}
