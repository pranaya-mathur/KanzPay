#!/usr/bin/env node
import { ingestCrawlResults } from '../modules/ingestion/ingestion.service.js';
import { refreshStaleOffers } from '../modules/offers/offers.service.js';
import { refreshAllSourceHealth } from '../modules/sources/sources.service.js';
import { generateCrawlTargets } from '../modules/crawler/crawl-targets.service.js';
import { syncApifyRunArtifacts } from '../modules/crawler/apify-sync.service.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';
import config from '../config.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipRefresh = args.includes('--skip-refresh');
const skipHealthRefresh = args.includes('--skip-health-refresh');
const writePlan = args.includes('--write-plan');
const apifyRunId = args.find((a) => a.startsWith('--apify-run='))?.split('=')[1];

async function main() {
    let paths = {
        crawlDataDir: config.crawlDataDir,
        discoveryDataPath: config.discoveryDataPath,
        runSummaryPath: config.runSummaryPath,
    };

    if (apifyRunId) {
        paths = await syncApifyRunArtifacts({ runId: apifyRunId });
    }

    const ingest = await ingestCrawlResults({
        ...paths,
        dryRun,
        apifyRunId: apifyRunId || null,
        runType: 'crawl_ingest',
    });

    let refresh = null;
    if (!skipRefresh && !dryRun) {
        refresh = await refreshStaleOffers();
    }

    let validation = null;
    if (!dryRun && !skipHealthRefresh) {
        validation = await refreshAllSourceHealth();
    }

    let plan = null;
    if (writePlan && !dryRun) {
        plan = await generateCrawlTargets({ writeInput: true });
    }

    const summary = {
        ingestionRunId: ingest.runId,
        stats: ingest.stats,
        refresh,
        validationCount: validation?.refreshed ?? null,
        planGenerated: !!plan,
    };

    logger.info('Pipeline complete', summary);
    console.log(JSON.stringify(summary, null, 2));
    return summary;
}

main()
    .then(() => closePool())
    .catch((err) => {
        logger.error('Pipeline failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
