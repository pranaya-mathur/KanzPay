#!/usr/bin/env node
import { runValidityAudit } from '../modules/enrichment/audit-validity.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';
import config from '../config.js';

const args = process.argv.slice(2);
const sampleArg = args.find((a) => a.startsWith('--sample='));
const llmSampleSize = sampleArg ? Number(sampleArg.split('=')[1]) : config.auditLlmSampleSize;

runValidityAudit({ llmSampleSize })
    .then((summary) => {
        console.log(JSON.stringify(summary, null, 2));
        return closePool();
    })
    .catch((err) => {
        logger.error('audit-validity job failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
