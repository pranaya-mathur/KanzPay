import config from '../../config.js';
import logger from '../../shared/utils/logger.js';
import { syncApifyRunArtifacts } from '../crawler/apify-sync.service.js';
import { startIngestionRun } from '../ingestion/ingestion.service.js';

function verifyWebhookSecret(req) {
    const secret = config.apifyWebhookSecret;
    if (!secret) return true;
    const header = req.headers['x-apify-webhook-secret'] || req.body?.secret;
    return header === secret;
}

export async function handleApifyWebhook(req, res, next) {
    try {
        if (!verifyWebhookSecret(req)) {
            return res.status(401).json({ error: 'Invalid webhook secret' });
        }

        const {
            resource = {},
            eventType,
        } = req.body || {};

        const runId = resource.id || req.body?.runId;
        const status = resource.status || req.body?.status;
        const datasetId = resource.defaultDatasetId || req.body?.defaultDatasetId;
        const keyValueStoreId = resource.defaultKeyValueStoreId || req.body?.defaultKeyValueStoreId;

        if (eventType && !String(eventType).includes('SUCCEEDED') && status !== 'SUCCEEDED') {
            return res.json({ skipped: true, reason: 'not_success', status, eventType });
        }

        const paths = await syncApifyRunArtifacts({ runId, datasetId, keyValueStoreId });
        const ingest = await startIngestionRun({
            crawlDataDir: paths.crawlDataDir,
            discoveryDataPath: paths.discoveryDataPath,
            runSummaryPath: paths.runSummaryPath,
            apifyRunId: runId,
            runType: paths.discoveryDataPath ? 'discovery_ingest' : 'crawl_ingest',
        });

        logger.info('Apify webhook ingest complete', { runId, ingestRunId: ingest.runId });
        res.status(202).json({
            ok: true,
            apifyRunId: runId,
            ingestionRunId: ingest.runId,
            stats: ingest.stats,
        });
    } catch (err) {
        next(err);
    }
}
