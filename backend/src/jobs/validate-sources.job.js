import { validateSource, refreshAllSourceHealth } from '../modules/sources/sources.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';

const recomputeAll = process.argv.includes('--all');

validateSource({ recomputeAll })
    .then((result) => {
        logger.info('Source validation finished', result);
        return closePool();
    })
    .catch((err) => {
        logger.error('Source validation failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
