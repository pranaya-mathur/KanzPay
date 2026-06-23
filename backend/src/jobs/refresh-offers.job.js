import { refreshStaleOffers } from '../modules/offers/offers.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';

refreshStaleOffers()
    .then((count) => {
        logger.info('Refresh job finished', { staleMarked: count });
        return closePool();
    })
    .catch((err) => {
        logger.error('Refresh job failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
