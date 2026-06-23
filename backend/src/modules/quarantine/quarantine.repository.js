import { query } from '../../db/pool.js';

function rowToQuarantine(row) {
    if (!row) return null;
    return {
        id: row.id,
        runId: row.run_id,
        sourceId: row.source_id,
        sourceUrl: row.source_url,
        canonicalKey: row.canonical_key,
        rawPayloadJson: row.raw_payload_json,
        normalizedPayloadJson: row.normalized_payload_json,
        rejectionReasonsJson: row.rejection_reasons_json,
        confidence: row.confidence != null ? Number(row.confidence) : null,
        sourceType: row.source_type,
        discoveryQuery: row.discovery_query,
        discoverySource: row.discovery_source,
        serpRank: row.serp_rank,
        quarantineType: row.quarantine_type,
        reviewStatus: row.review_status,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        createdAt: row.created_at,
    };
}

function buildWhere(filters) {
    const clauses = [];
    const params = [];
    let idx = 1;

    if (filters.runId) {
        clauses.push(`run_id = $${idx++}`);
        params.push(filters.runId);
    }
    if (filters.sourceType) {
        clauses.push(`source_type = $${idx++}`);
        params.push(filters.sourceType);
    }
    if (filters.sourceUrl) {
        clauses.push(`source_url ILIKE $${idx++}`);
        params.push(`%${filters.sourceUrl}%`);
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
    if (filters.q) {
        clauses.push(`(
            source_url ILIKE $${idx}
            OR raw_payload_json::text ILIKE $${idx}
            OR normalized_payload_json::text ILIKE $${idx}
        )`);
        params.push(`%${filters.q}%`);
        idx += 1;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { where, params };
}

const SORT_COLUMNS = {
    createdAt: 'created_at',
    confidence: 'confidence',
};

export async function insertQuarantineRecord(client, record) {
    const { rows } = await client.query(
        `INSERT INTO quarantine_records (
            run_id, source_id, source_url, canonical_key, raw_payload_json, normalized_payload_json,
            rejection_reasons_json, confidence, source_type, discovery_query, discovery_source, serp_rank,
            quarantine_type, review_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *`,
        [
            record.runId,
            record.sourceId ?? null,
            record.sourceUrl,
            record.canonicalKey,
            JSON.stringify(record.rawPayloadJson),
            record.normalizedPayloadJson ? JSON.stringify(record.normalizedPayloadJson) : null,
            JSON.stringify(record.rejectionReasonsJson),
            record.confidence,
            record.sourceType,
            record.discoveryQuery,
            record.discoverySource,
            record.serpRank,
            record.quarantineType ?? null,
            record.reviewStatus || 'pending',
        ],
    );
    return rowToQuarantine(rows[0]);
}

export async function findQuarantineRecords(filters = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    const sortCol = SORT_COLUMNS[filters.sort] || 'created_at';
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';

    const { where, params } = buildWhere(filters);
    const countResult = await query(`SELECT COUNT(*)::int AS total FROM quarantine_records ${where}`, params);
    const total = countResult.rows[0].total;

    const listParams = [...params, limit, offset];
    const { rows } = await query(
        `SELECT * FROM quarantine_records ${where}
         ORDER BY ${sortCol} ${order}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams,
    );

    return {
        data: rows.map(rowToQuarantine),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
}

export async function findQuarantineById(id) {
    const { rows } = await query('SELECT * FROM quarantine_records WHERE id = $1', [id]);
    return rowToQuarantine(rows[0]);
}

export async function updateQuarantineReview(id, { reviewStatus, reviewedBy = 'system' }) {
    const { rows } = await query(
        `UPDATE quarantine_records
         SET review_status = $2, reviewed_at = NOW(), reviewed_by = $3
         WHERE id = $1
         RETURNING *`,
        [id, reviewStatus, reviewedBy],
    );
    return rowToQuarantine(rows[0]);
}

export async function getQuarantineStats() {
    const { rows } = await query(
        `SELECT quarantine_type, source_type, discovery_query, COUNT(*)::int AS count
         FROM quarantine_records
         GROUP BY quarantine_type, source_type, discovery_query
         ORDER BY count DESC`,
    );
    const byType = {};
    const bySource = {};
    for (const row of rows) {
        const type = row.quarantine_type || 'unknown';
        byType[type] = (byType[type] || 0) + row.count;
        const src = row.source_type || 'unknown';
        bySource[src] = (bySource[src] || 0) + row.count;
    }
    return { breakdown: rows, byType, bySource };
}
