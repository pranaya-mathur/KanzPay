import fs from 'fs/promises';
import path from 'path';
import config from '../../config.js';
import logger from '../../shared/utils/logger.js';

/**
 * Sync Apify run artifacts to local storage paths for ingestion.
 * When APIFY_TOKEN is unset, assumes files already exist at default paths.
 */
export async function syncApifyRunArtifacts({ runId, datasetId, keyValueStoreId } = {}) {
    const result = {
        crawlDataDir: config.crawlDataDir,
        discoveryDataPath: config.discoveryDataPath,
        runSummaryPath: config.runSummaryPath,
        synced: false,
        runId: runId || null,
    };

    if (!config.apifyToken || !runId) {
        logger.info('Apify sync skipped — using local storage paths', result);
        return result;
    }

    const token = config.apifyToken;
    const base = 'https://api.apify.com/v2';

    try {
        if (datasetId) {
            await fs.mkdir(config.crawlDataDir, { recursive: true });
            const itemsUrl = `${base}/datasets/${datasetId}/items?format=json&clean=true&token=${token}`;
            const res = await fetch(itemsUrl);
            if (!res.ok) throw new Error(`Dataset fetch failed: ${res.status}`);
            const items = await res.json();
            let idx = 0;
            for (const item of items) {
                idx += 1;
                const file = path.join(config.crawlDataDir, `${String(idx).padStart(9, '0')}.json`);
                await fs.writeFile(file, JSON.stringify(item, null, 2));
            }
            result.datasetItems = items.length;
        }

        const kvId = keyValueStoreId || 'default';
        if (kvId) {
            const kvDir = path.dirname(config.discoveryDataPath);
            await fs.mkdir(kvDir, { recursive: true });
            for (const [key, outPath] of [
                ['DISCOVERY_RESULTS', config.discoveryDataPath],
                ['RUN_SUMMARY', config.runSummaryPath],
            ]) {
                const url = `${base}/key-value-stores/${kvId}/records/${key}?token=${token}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    await fs.writeFile(outPath, JSON.stringify(data, null, 2));
                    result[key] = true;
                }
            }
        }

        result.synced = true;
        logger.info('Apify artifacts synced', result);
        return result;
    } catch (err) {
        logger.error('Apify sync failed', { error: err.message, runId });
        throw err;
    }
}
