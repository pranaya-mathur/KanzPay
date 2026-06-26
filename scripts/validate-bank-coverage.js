#!/usr/bin/env node
/**
 * Validate per-bank offer coverage after crawl + ingest.
 * Exits non-zero if any threshold is missed.
 */
import { query } from '../backend/src/db/pool.js';
import { closePool } from '../backend/src/db/pool.js';

const THRESHOLDS = {
    adcb: { minStrong: 50, minTotal: 100 },
    visaUAE: { minStrong: 30, minTotal: 50 },
    fab: { minStrong: 15, minTotal: 20 },
    emiratesNbd: { minStrong: 20, minTotal: 30 },
    mashreq: { minStrong: 15, minTotal: 25 },
    hsbc: { minStrong: 8, minTotal: 10 },
    adib: { minStrong: 5, minTotal: 8 },
    dib: { minStrong: 3, minTotal: 5 },
};

const STRONG_SQL = `
    merchant_name IS NOT NULL
    AND COALESCE(NULLIF(regexp_replace(discount_value, '[^0-9.]', '', 'g'), '')::numeric, 0) > 1
    AND NOT (categories @> '["touchpoints_burn"]'::jsonb)
`;

async function main() {
    const { rows } = await query(
        `SELECT source_type,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ${STRONG_SQL})::int AS strong
         FROM offers
         WHERE source_type = ANY($1::text[])
         GROUP BY source_type`,
        [Object.keys(THRESHOLDS)],
    );

    const byType = Object.fromEntries(rows.map((r) => [r.source_type, r]));
    const failures = [];
    const report = [];

    for (const [sourceType, threshold] of Object.entries(THRESHOLDS)) {
        const stats = byType[sourceType] || { total: 0, strong: 0 };
        const ok = stats.strong >= threshold.minStrong && stats.total >= threshold.minTotal;
        report.push({
            sourceType,
            total: stats.total,
            strong: stats.strong,
            minTotal: threshold.minTotal,
            minStrong: threshold.minStrong,
            passed: ok,
        });
        if (!ok) failures.push(sourceType);
    }

    console.log(JSON.stringify({ report, passed: failures.length === 0 }, null, 2));

    if (failures.length > 0) {
        console.error(`Coverage validation failed for: ${failures.join(', ')}`);
        process.exitCode = 1;
    }
}

main()
    .then(() => closePool())
    .catch((err) => {
        console.error(err.message);
        closePool().finally(() => process.exit(1));
    });
