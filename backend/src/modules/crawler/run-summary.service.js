import fs from 'fs';
import config from '../../config.js';
import logger from '../../shared/utils/logger.js';
import { insertObservation } from '../sources/sources.repository.js';

export async function loadRunSummary(filePath = config.runSummaryPath) {
    try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.debug('No RUN_SUMMARY file found', { filePath });
            return null;
        }
        throw err;
    }
}

/**
 * Feed crawler per-source quality metrics into source observations.
 */
export async function applyRunSummaryToSourceValidation(runSummary, sourceIndex) {
    if (!runSummary?.qualityBySource) return;
    for (const [sourceType, metrics] of Object.entries(runSummary.qualityBySource)) {
        const source = sourceIndex.get(sourceType);
        if (!source?.id) continue;
        const pages = metrics.pages || 0;
        const shellRate = pages ? (metrics.skippedShell || 0) / pages : 0;
        const categoryNoiseRate = pages ? (metrics.skippedCategory || 0) / pages : 0;
        const validationFailRate = pages ? (metrics.skippedValidation || 0) / pages : 0;

        await insertObservation(
            source.id,
            null,
            'crawler_quality',
            'shell_rate',
            shellRate,
            {
                pages,
                offersEmitted: metrics.offersEmitted || 0,
                shellRate,
                categoryNoiseRate,
                validationFailRate,
                source: 'RUN_SUMMARY',
            },
        ).catch(() => {});
    }
}

export function extractCrawlerMetrics(runSummary) {
    if (!runSummary?.qualityBySource) return {};
    const out = {};
    for (const [sourceType, metrics] of Object.entries(runSummary.qualityBySource)) {
        const pages = metrics.pages || 0;
        out[sourceType] = {
            ...metrics,
            shellRate: pages ? (metrics.skippedShell || 0) / pages : 0,
            categoryNoiseRate: pages ? (metrics.skippedCategory || 0) / pages : 0,
        };
    }
    return out;
}
