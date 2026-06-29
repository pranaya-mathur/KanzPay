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
        validityStatus: row.validity_status || 'unknown',
        verifyRequired: row.verify_required ?? false,
        llmEnrichedAt: row.llm_enriched_at || null,
        llmConfidence: row.llm_confidence != null ? Number(row.llm_confidence) : null,
        llmEnrichment: row.llm_enrichment_json || {},
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
        clauses.push(`validity_status NOT IN ('expired', 'not_yet_active')`);
    }
    if (filters.validityStatus) {
        clauses.push(`validity_status = $${idx++}`);
        params.push(filters.validityStatus);
    }
    if (filters.verifyRequired === true) {
        clauses.push(`verify_required = true`);
    } else if (filters.verifyRequired === false) {
        clauses.push(`verify_required = false`);
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

export async function findOffersNeedingEnrichment(limit = 100) {
    const { rows } = await query(
        `SELECT o.*, r.raw_text
         FROM offers o
         LEFT JOIN LATERAL (
             SELECT raw_text FROM raw_crawl_events
             WHERE source_url = o.source_url
             ORDER BY created_at DESC LIMIT 1
         ) r ON true
         WHERE o.freshness_status = 'fresh'
           AND (o.llm_enriched_at IS NULL OR o.llm_enriched_at < o.last_seen_at)
           AND (
             o.valid_to IS NULL OR o.min_spend IS NULL OR o.cap_value IS NULL
             OR o.card_name IS NULL OR o.terms_url IS NULL OR o.verify_required = true
           )
         ORDER BY o.confidence DESC, o.last_seen_at DESC
         LIMIT $1`,
        [limit],
    );
    return rows.map((row) => ({
        ...rowToOffer(row),
        rawText: row.raw_text || row.offer_description || '',
    }));
}

export async function updateOfferEnrichment(offerId, patch) {
    const { rows } = await query(
        `UPDATE offers SET
            valid_from = COALESCE($2, valid_from),
            valid_to = COALESCE($3, valid_to),
            min_spend = COALESCE($4, min_spend),
            cap_value = COALESCE($5, cap_value),
            card_name = COALESCE($6, card_name),
            coupon_code = COALESCE($7, coupon_code),
            terms_url = COALESCE($8, terms_url),
            validity_status = $9,
            verify_required = $10,
            llm_enriched_at = NOW(),
            llm_confidence = $11,
            llm_enrichment_json = $12,
            updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
            offerId,
            patch.validFrom ?? null,
            patch.validTo ?? null,
            patch.minSpend ?? null,
            patch.capValue ?? null,
            patch.cardName ?? null,
            patch.couponCode ?? null,
            patch.termsUrl ?? null,
            patch.validityStatus,
            patch.verifyRequired ?? false,
            patch.llmConfidence ?? null,
            JSON.stringify(patch.llmEnrichmentJson || {}),
        ],
    );
    return rowToOffer(rows[0]);
}

export async function auditExpiredOffers() {
    const expired = await query(
        `UPDATE offers SET
            validity_status = 'expired',
            freshness_status = 'stale',
            updated_at = NOW()
         WHERE valid_to IS NOT NULL AND valid_to < CURRENT_DATE
           AND validity_status != 'expired'
         RETURNING id`,
    );

    const verifyFlip = await query(
        `UPDATE offers SET verify_required = true, updated_at = NOW()
         WHERE valid_to IS NULL AND verify_required = false
           AND validity_status IN ('active', 'unknown')
         RETURNING id`,
    );

    const activeBackfill = await query(
        `UPDATE offers SET validity_status = 'active', updated_at = NOW()
         WHERE validity_status = 'unknown'
           AND valid_to IS NOT NULL AND valid_to >= CURRENT_DATE
           AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
           AND verify_required = false
         RETURNING id`,
    );

    return {
        markedExpired: expired.rowCount,
        verifyRequiredSet: verifyFlip.rowCount,
        markedActive: activeBackfill.rowCount,
    };
}

export async function findOffersForLlmAudit(limit = 50) {
    const { rows } = await query(
        `SELECT o.*, r.raw_text
         FROM offers o
         LEFT JOIN LATERAL (
             SELECT raw_text FROM raw_crawl_events
             WHERE source_url = o.source_url
             ORDER BY created_at DESC LIMIT 1
         ) r ON true
         WHERE o.freshness_status = 'fresh'
           AND (
             o.verify_required = true
             OR o.validity_status = 'unknown'
             OR (o.confidence >= 0.65 AND o.confidence < 0.79)
           )
         ORDER BY o.updated_at ASC
         LIMIT $1`,
        [limit],
    );
    return rows.map((row) => ({
        ...rowToOffer(row),
        rawText: row.raw_text || row.offer_description || '',
    }));
}
