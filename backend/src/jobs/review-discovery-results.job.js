#!/usr/bin/env node
import { buildDiscoveryCandidates } from '../modules/discovery/discovery-candidates.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';

buildDiscoveryCandidates()
    .then((result) => {
        logger.info('Discovery candidates built', { count: result.candidateCount });
        console.log(JSON.stringify(result, null, 2));
        return closePool();
    })
    .catch((err) => {
        logger.error('Review discovery job failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
