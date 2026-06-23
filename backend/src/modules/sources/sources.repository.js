import { query } from '../../db/pool.js';
import { normalizeDomain } from '../../shared/utils/domain-normalize.js';

function rowToSource(row) {
    if (!row) return null;
    return {
        id: row.id,
        sourceName: row.source_name,
        domain: row.domain,
        baseUrl: row.base_url,
        sourceType: row.source_type,
        category: row.category,
        status: row.status,
        priority: row.priority,
        approvalReason: row.approval_reason,
        rejectionReason: row.rejection_reason,
        confidence: Number(row.confidence),
        avgOfferConfidence: row.avg_offer_confidence != null ? Number(row.avg_offer_confidence) : null,
        avgFieldCompleteness: row.avg_field_completeness != null ? Number(row.avg_field_completeness) : null,
        avgParseSuccessRate: row.avg_parse_success_rate != null ? Number(row.avg_parse_success_rate) : null,
        avgMerchantYield: row.avg_merchant_yield != null ? Number(row.avg_merchant_yield) : null,
        avgFreshnessScore: row.avg_freshness_score != null ? Number(row.avg_freshness_score) : null,
        lastCrawledAt: row.last_crawled_at,
        lastPassedAt: row.last_passed_at,
        lastFailedAt: row.last_failed_at,
        successCount: row.success_count,
        failureCount: row.failure_count,
        quarantineCount: row.quarantine_count,
        sampleSize: row.sample_size,
        parserProfileJson: row.parser_profile_json,
        crawlRulesJson: row.crawl_rules_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function buildWhere(filters) {
    const clauses = [];
    const params = [];
    let idx = 1;

    if (filters.status) {
        clauses.push(`status = $${idx++}`);
        params.push(filters.status);
    }
    if (filters.sourceType) {
        clauses.push(`source_type = $${idx++}`);
        params.push(filters.sourceType);
    }
    if (filters.category) {
        clauses.push(`category = $${idx++}`);
        params.push(filters.category);
    }
    if (filters.domain) {
        clauses.push(`domain = $${idx++}`);
        params.push(normalizeDomain(filters.domain));
    }
    if (filters.confidenceMin != null) {
        clauses.push(`confidence >= $${idx++}`);
        params.push(filters.confidenceMin);
    }
    if (filters.confidenceMax != null) {
        clauses.push(`confidence <= $${idx++}`);
        params.push(filters.confidenceMax);
    }

    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const SORT_COLUMNS = {
    confidence: 'confidence',
    priority: 'priority',
    lastCrawledAt: 'last_crawled_at',
    sampleSize: 'sample_size',
    updatedAt: 'updated_at',
};

export async function findSources(filters = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    const sortCol = SORT_COLUMNS[filters.sort] || 'priority';
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';
    const { where, params } = buildWhere(filters);

    const countResult = await query(`SELECT COUNT(*)::int AS total FROM sources ${where}`, params);
    const { rows } = await query(
        `SELECT * FROM sources ${where} ORDER BY ${sortCol} ${order} NULLS LAST
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
    );

    return {
        data: rows.map(rowToSource),
        pagination: {
            page, limit, total: countResult.rows[0].total,
            totalPages: Math.ceil(countResult.rows[0].total / limit),
        },
    };
}

export async function findSourceById(id) {
    const { rows } = await query('SELECT * FROM sources WHERE id = $1', [id]);
    return rowToSource(rows[0]);
}

export async function findSourceByDomainAndType(domain, sourceType) {
    const { rows } = await query(
        'SELECT * FROM sources WHERE domain = $1 AND source_type = $2',
        [normalizeDomain(domain), sourceType],
    );
    return rowToSource(rows[0]);
}

export async function findSourceForUrl(url) {
    const { rows } = await query(
        `SELECT * FROM sources
         WHERE $1 ILIKE '%' || domain || '%'
         ORDER BY priority DESC
         LIMIT 1`,
        [url],
    );
    return rowToSource(rows[0]);
}

export async function findSourcesByStatus(status) {
    const { rows } = await query(
        'SELECT * FROM sources WHERE status = $1 ORDER BY priority DESC',
        [status],
    );
    return rows.map(rowToSource);
}

export async function upsertSource(record) {
    const { rows } = await query(
        `INSERT INTO sources (
            source_name, domain, base_url, source_type, category, status, priority,
            parser_profile_json, crawl_rules_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (domain, source_type) DO UPDATE SET
            source_name = EXCLUDED.source_name,
            base_url = EXCLUDED.base_url,
            category = EXCLUDED.category,
            updated_at = NOW()
        RETURNING *`,
        [
            record.sourceName, normalizeDomain(record.domain), record.baseUrl,
            record.sourceType, record.category || 'generic',
            record.status || 'probation', record.priority ?? 50,
            JSON.stringify(record.parserProfileJson || {}),
            JSON.stringify(record.crawlRulesJson || {}),
        ],
    );
    return rowToSource(rows[0]);
}

export async function updateSourceMetrics(id, metrics, classification) {
    const { rows } = await query(
        `UPDATE sources SET
            confidence = $2,
            avg_offer_confidence = $3,
            avg_field_completeness = $4,
            avg_parse_success_rate = $5,
            avg_merchant_yield = $6,
            avg_freshness_score = $7,
            sample_size = $8,
            quarantine_count = $9,
            status = COALESCE($10, status),
            approval_reason = CASE WHEN $10 = 'approved' THEN $11 ELSE approval_reason END,
            rejection_reason = CASE WHEN $10 = 'rejected' THEN $11 ELSE rejection_reason END,
            last_passed_at = CASE WHEN $10 IN ('approved','probation') THEN NOW() ELSE last_passed_at END,
            last_failed_at = CASE WHEN $10 = 'rejected' THEN NOW() ELSE last_failed_at END,
            updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
            id,
            metrics.score,
            metrics.avgOfferConfidence,
            metrics.avgFieldCompleteness,
            metrics.avgParseSuccessRate,
            metrics.avgMerchantYield,
            metrics.avgFreshnessScore,
            metrics.sampleSize,
            metrics.quarantineCount ?? 0,
            classification?.status ?? null,
            classification?.reason ?? null,
        ],
    );
    return rowToSource(rows[0]);
}

export async function updateSourceStatus(id, status, reason) {
    const { rows } = await query(
        `UPDATE sources SET
            status = $2,
            approval_reason = CASE WHEN $2 = 'approved' THEN $3 ELSE approval_reason END,
            rejection_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE rejection_reason END,
            updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, status, reason],
    );
    return rowToSource(rows[0]);
}

export async function createSourceRun(sourceId, runType = 'validation') {
    const { rows } = await query(
        `INSERT INTO source_runs (source_id, run_type, status) VALUES ($1, $2, 'running') RETURNING *`,
        [sourceId, runType],
    );
    return rows[0];
}

export async function finishSourceRun(runId, status, stats, score, errorMessage = null) {
    await query(
        `UPDATE source_runs SET status = $2, stats_json = $3, score = $4,
         finished_at = NOW(), error_message = $5 WHERE id = $1`,
        [runId, status, JSON.stringify(stats), score, errorMessage],
    );
}

export async function insertObservation(sourceId, sourceRunId, type, metricName, metricValue, details = {}) {
    await query(
        `INSERT INTO source_observations (source_id, source_run_id, observation_type, metric_name, metric_value, details_json)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [sourceId, sourceRunId, type, metricName, metricValue, JSON.stringify(details)],
    );
}

export async function insertFailure(sourceId, sourceRunId, failureType, reason, sampleUrl, details = {}) {
    await query(
        `INSERT INTO source_failures (source_id, source_run_id, failure_type, reason, sample_url, details_json)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [sourceId, sourceRunId, failureType, reason, sampleUrl, JSON.stringify(details)],
    );
}

export async function getOffersForSource(sourceId) {
    const { rows } = await query(
        'SELECT * FROM offers WHERE source_id = $1 OR source_type = (SELECT source_type FROM sources WHERE id = $1)',
        [sourceId],
    );
    return rows;
}

export async function getQuarantineStatsForSource(sourceId) {
    const { rows } = await query(
        `SELECT COUNT(*)::int AS total FROM quarantine_records
         WHERE source_id = $1 OR source_type = (SELECT source_type FROM sources WHERE id = $1)`,
        [sourceId],
    );
    return rows[0]?.total ?? 0;
}

export async function getRecentFailures(sourceId, limit = 5) {
    const { rows } = await query(
        `SELECT * FROM source_failures WHERE source_id = $1
         ORDER BY occurred_at DESC LIMIT $2`,
        [sourceId, limit],
    );
    return rows;
}

export async function linkOffersToSource(sourceId, sourceType, domain) {
    await query(
        `UPDATE offers SET source_id = $1
         WHERE source_id IS NULL AND (source_type = $2 OR normalized_url ILIKE $3)`,
        [sourceId, sourceType, `%${domain}%`],
    );
}
