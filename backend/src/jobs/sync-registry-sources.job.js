#!/usr/bin/env node
/**
 * Sync canonical crawler registry tiers into the sources table.
 * Run after migration 012 or when code registry drifts from DB.
 */
import { DEFAULT_SOURCES } from '../../../src/sources/source-registry.js';
import { TIER_A_SOURCE_TYPES } from '../modules/sources/source-classifier.service.js';
import * as repo from '../modules/sources/sources.repository.js';
import { closePool } from '../db/pool.js';
import logger from '../shared/utils/logger.js';

const BANK_NETWORK_TYPES = new Set([
    'emiratesNbd', 'adcb', 'mashreq', 'fab', 'dib', 'adib',
    'rakBank', 'hsbc', 'cbd', 'visaUAE',
]);

async function main() {
    const synced = [];
    for (const source of DEFAULT_SOURCES) {
        if (!BANK_NETWORK_TYPES.has(source.sourceType)) continue;

        const statusLocked = TIER_A_SOURCE_TYPES.has(source.sourceType);
        const updated = await repo.syncSourceFromRegistry({
            sourceName: source.sourceName,
            domain: source.domain,
            baseUrl: source.baseUrl,
            sourceType: source.sourceType,
            category: source.category || 'bank',
            status: source.status,
            priority: source.priority,
            statusLocked,
            parserProfile: source.parserProfile || {},
            approvalReason: `registry_sync:${source.sourceType}`,
        });
        synced.push({
            sourceType: updated.sourceType,
            status: updated.status,
            statusLocked: updated.statusLocked,
            priority: updated.priority,
        });
    }

    logger.info('Registry sync complete', { count: synced.length });
    console.log(JSON.stringify({ synced }, null, 2));
    return synced;
}

main()
    .then(() => closePool())
    .catch((err) => {
        logger.error('Registry sync failed', { error: err.message });
        closePool().finally(() => process.exit(1));
    });
