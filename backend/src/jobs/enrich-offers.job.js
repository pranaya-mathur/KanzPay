#!/usr/bin/env node
import { runOfferEnrichmentBatch } from '../modules/enrichment/enrich-offers.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';
import config from '../config.js';

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : config.enrichmentBatchSize;

async function main() {
    if (!config.enrichmentEnabled && !args.includes('--force')) {
        console.log('Enrichment disabled. Set ENRICHMENT_ENABLED=true or pass --force');
        return { skipped: true };
    }

    const stats = await runOfferEnrichmentBatch({ limit });
    console.log(JSON.stringify(stats, null, 2));
    return stats;
}

main()
    .then(() => closePool())
    .catch((err) => {
        logger.error('enrich-offers job failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
