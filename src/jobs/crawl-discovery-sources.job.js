#!/usr/bin/env node
/**
 * Build Apify INPUT for discovery-enabled crawls (weekly SERP seeding).
 * Usage: node src/jobs/crawl-discovery-sources.job.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveRegistry } from '../sources/source-registry.js';
import { buildStartUrlsFromRegistry } from '../sources/source-policy.js';
import { DEFAULT_DISCOVERY_QUERIES } from '../utils/serpDiscovery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../storage/key_value_stores/default');
const outPath = path.join(outDir, 'INPUT.discovery.json');

const registry = resolveRegistry();
const startUrls = buildStartUrlsFromRegistry(registry, { includeProbation: true });

const MERCHANT_DISCOVERY_QUERIES = [
    'Noon UAE promo code 2026',
    'Talabat coupon UAE',
    'Namshi discount code UAE',
    'Carrefour UAE bank card offer',
    'Amazon.ae coupon UAE',
    'Shukran offers UAE',
    'site:picodi.com/ae promo code',
    'site:groupon.ae coupon UAE',
];

const input = {
    useSourceRegistry: true,
    startUrls,
    discoveryEnabled: true,
    discoveryQueries: [...DEFAULT_DISCOVERY_QUERIES, ...MERCHANT_DISCOVERY_QUERIES],
    discoveryMaxResults: 15,
    discoveryPages: 2,
    discoveryCountry: 'ae',
    discoveryLanguage: 'en',
    maxDepth: 2,
    crawlerMode: 'playwright',
    maxRequestsPerCrawl: 350,
    allowedDomains: [
        ...(registry.allowedDomains || []),
        'noon.com', 'talabat.com', 'namshi.com', 'amazon.ae',
        'picodi.com', 'groupon.ae', 'cuponation.ae', 'coupons.ae',
        'shukran.com', 'bluerewards.ae', 'visa.co.ae',
    ],
    saveSnapshots: true,
    dryRun: false,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(input, null, 2));
console.log(`Wrote ${outPath} with ${input.discoveryQueries.length} discovery queries`);
