#!/usr/bin/env node
/**
 * Purge stale offers and release quarantined records for re-ingest.
 */
import { query } from '../db/pool.js';
import * as repo from '../modules/sources/sources.repository.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';

async function main() {
    const hsbc = await query(
        `DELETE FROM offers WHERE source_type = 'hsbc' AND (
            merchant_name IS NULL OR discount_value IS NULL
            OR COALESCE(NULLIF(regexp_replace(discount_value, '[^0-9.]', '', 'g'), '')::numeric, 0) <= 1
        ) RETURNING id`,
    );

    const fabNoise = await query(
        `DELETE FROM offers WHERE source_type = 'fab' AND (
            offer_title ILIKE '%shard%' OR offer_title ILIKE '%sea life%'
            OR merchant_name ILIKE '%food & drink offers%'
            OR merchant_name ILIKE '%seasonal offers%'
        ) RETURNING id`,
    );

    const adcbNoise = await query(
        `DELETE FROM offers WHERE source_type = 'adcb' AND (
            merchant_name ILIKE '%logo facebook%'
            OR offer_title ILIKE '%refer a friend%'
            OR offer_title ILIKE '%touchpoints max%'
        ) RETURNING id`,
    );

    const released = await repo.releaseQuarantineBySourceTypes(['fab', 'adcb'], 'rejected_source');

    const alignment = await query(
        `SELECT source_type, status, status_locked, priority, sample_size
         FROM sources
         WHERE source_type IN ('emiratesNbd','adcb','mashreq','fab','dib','adib','hsbc','rakBank','cbd','visaUAE')
         ORDER BY priority DESC`,
    );

    const summary = {
        purged: {
            hsbc: hsbc.rows.length,
            fabNoise: fabNoise.rows.length,
            adcbNoise: adcbNoise.rows.length,
        },
        quarantineReleased: released,
        sources: alignment.rows,
    };

    logger.info('Purge complete', summary);
    console.log(JSON.stringify(summary, null, 2));
    return summary;
}

main()
    .then(() => closePool())
    .catch((err) => {
        logger.error('Purge failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
