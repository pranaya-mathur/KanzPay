import { refreshAllSourceHealth } from '../modules/sources/sources.service.js';
import { generateCrawlTargets } from '../modules/crawler/crawl-targets.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';

const writePlan = process.argv.includes('--write-plan');

refreshAllSourceHealth()
    .then(async (result) => {
        logger.info('Source health refresh finished', { refreshed: result.refreshed });
        if (writePlan) {
            const targets = await generateCrawlTargets({ writeInput: true });
            logger.info('Crawl plan regenerated', { targets: targets.startUrls.length });
        }
        return closePool();
    })
    .catch((err) => {
        logger.error('Source health refresh failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
