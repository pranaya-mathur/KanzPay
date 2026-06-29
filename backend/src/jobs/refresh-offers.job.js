import { refreshStaleOffers } from '../modules/offers/offers.service.js';
import { runValidityAudit } from '../modules/enrichment/audit-validity.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';

refreshStaleOffers()
    .then(async (count) => {
        const audit = await runValidityAudit({ llmSampleSize: 0 });
        logger.info('Refresh job finished', { staleMarked: count, audit });
        return closePool();
    })
    .catch((err) => {
        logger.error('Refresh job failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
