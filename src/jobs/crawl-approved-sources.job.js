#!/usr/bin/env node
/**
 * Build Apify INPUT for approved/probation UAE sources from registry.
 * Usage: node src/jobs/crawl-approved-sources.job.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveRegistry } from '../sources/source-registry.js';
import { buildStartUrlsFromRegistry } from '../sources/source-policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../storage/key_value_stores/default');
const outPath = path.join(outDir, 'INPUT.json');

const registry = resolveRegistry();
const startUrls = buildStartUrlsFromRegistry(registry, { includeProbation: true });

const input = {
    useSourceRegistry: true,
    startUrls,
    maxDepth: 2,
    maxRequestsPerCrawl: 300,
    crawlerMode: registry.crawlerMode ?? 'playwright',
    allowedDomains: registry.allowedDomains
        || [...new Set(registry.sources.map((s) => s.domain).filter(Boolean))],
    discoveryEnabled: false,
    saveSnapshots: true,
    dryRun: false,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(input, null, 2));
console.log(`Wrote ${outPath} with ${startUrls.length} start URLs`);
