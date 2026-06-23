import { ingestCrawlResults } from '../modules/ingestion/ingestion.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';

const dryRun = process.argv.includes('--dry-run');

ingestCrawlResults({ dryRun })
    .then((result) => {
        logger.info('Ingest job finished', result);
        return closePool();
    })
    .catch((err) => {
        logger.error('Ingest job failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
