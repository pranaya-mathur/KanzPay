import { query } from '../../db/pool.js';

function rowToOffer(row) {
    if (!row) return null;
    return {
        id: row.id,
        canonicalKey: row.canonical_key,
        sourceUrl: row.source_url,
        normalizedUrl: row.normalized_url,
        sourceType: row.source_type,
        bankName: row.bank_name,
        cardName: row.card_name,
        merchantName: row.merchant_name,
        offerTitle: row.offer_title,
        offerDescription: row.offer_description,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        currency: row.currency,
        minSpend: row.min_spend != null ? Number(row.min_spend) : null,
        capValue: row.cap_value != null ? Number(row.cap_value) : null,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        couponCode: row.coupon_code,
        paymentMethods: row.payment_methods || [],
        eligibleMccList: row.eligible_mcc_list || [],
        categories: row.categories || [],
        stackable: row.stackable,
        termsUrl: row.terms_url,
        confidence: Number(row.confidence),
        freshnessStatus: row.freshness_status,
        discoveryQuery: row.discovery_query,
        discoverySource: row.discovery_source,
        serpRank: row.serp_rank,
        parserName: row.parser_name,
        crawlDepth: row.crawl_depth,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
    };
}

function buildWhere(filters) {
    const clauses = [];
    const params = [];
    let idx = 1;

    if (filters.sourceType) {
        clauses.push(`source_type = $${idx++}`);
        params.push(filters.sourceType);
    }
    if (filters.merchant) {
        clauses.push(`merchant_name ILIKE $${idx++}`);
        params.push(`%${filters.merchant}%`);
    }
    if (filters.bank) {
        clauses.push(`bank_name ILIKE $${idx++}`);
        params.push(`%${filters.bank}%`);
    }
    if (filters.card) {
        clauses.push(`card_name ILIKE $${idx++}`);
        params.push(`%${filters.card}%`);
    }
    if (filters.couponCode) {
        clauses.push(`coupon_code = $${idx++}`);
        params.push(filters.couponCode.toUpperCase());
    }
    if (filters.category) {
        clauses.push(`categories::text ILIKE $${idx++}`);
        params.push(`%${filters.category}%`);
    }
    if (filters.freshnessStatus) {
        clauses.push(`freshness_status = $${idx++}`);
        params.push(filters.freshnessStatus);
    }
    if (filters.discoveryQuery) {
        clauses.push(`discovery_query ILIKE $${idx++}`);
        params.push(`%${filters.discoveryQuery}%`);
    }
    if (filters.confidenceMin != null) {
        clauses.push(`confidence >= $${idx++}`);
        params.push(filters.confidenceMin);
    }
    if (filters.confidenceMax != null) {
        clauses.push(`confidence <= $${idx++}`);
        params.push(filters.confidenceMax);
    }
    if (filters.validNow) {
        clauses.push(`(valid_to IS NULL OR valid_to >= CURRENT_DATE)`);
    }
    if (filters.q) {
        clauses.push(`(
            offer_title ILIKE $${idx} OR offer_description ILIKE $${idx}
            OR merchant_name ILIKE $${idx} OR bank_name ILIKE $${idx}
        )`);
        params.push(`%${filters.q}%`);
        idx += 1;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { where, params };
}

const SORT_COLUMNS = {
    updatedAt: 'updated_at',
    confidence: 'confidence',
    lastSeenAt: 'last_seen_at',
};

export async function findOffers(filters = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    const sortCol = SORT_COLUMNS[filters.sort] || 'updated_at';
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';

    const { where, params } = buildWhere(filters);

    const countResult = await query(`SELECT COUNT(*)::int AS total FROM offers ${where}`, params);
    const total = countResult.rows[0].total;

    const listParams = [...params, limit, offset];
    const { rows } = await query(
        `SELECT * FROM offers ${where}
         ORDER BY ${sortCol} ${order}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams,
    );

    return {
        data: rows.map(rowToOffer),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export async function findOfferById(id) {
    const { rows } = await query('SELECT * FROM offers WHERE id = $1', [id]);
    return rowToOffer(rows[0]);
}

export async function findFreshOffers(filters = {}) {
    return findOffers({ ...filters, freshnessStatus: 'fresh', validNow: filters.validNow ?? true });
}

export async function findByMerchant(merchant, filters = {}) {
    return findOffers({ ...filters, merchant });
}

export async function findByBank(bank, filters = {}) {
    return findOffers({ ...filters, bank });
}

export async function findByCard(card, filters = {}) {
    return findOffers({ ...filters, card });
}

export async function markStaleOffers(sourceType = null) {
    const params = [];
    let sql = `
        UPDATE offers
        SET freshness_status = 'stale', updated_at = NOW()
        WHERE freshness_status = 'fresh'
          AND last_seen_at < NOW() - INTERVAL '1 day' * CASE source_type
    `;

    if (sourceType) {
        sql = `
            UPDATE offers
            SET freshness_status = 'stale', updated_at = NOW()
            WHERE freshness_status = 'fresh'
              AND source_type = $1
              AND last_seen_at < NOW() - INTERVAL '14 days'
            RETURNING id
        `;
        const { rows } = await query(sql, [sourceType]);
        return rows.length;
    }

    sql += `
            WHEN 'couponFeed' THEN 7
            WHEN 'merchant' THEN 10
            ELSE 14
          END
        RETURNING id
    `;
    const { rows } = await query(sql, params);
    return rows.length;
}
