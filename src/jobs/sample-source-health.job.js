#!/usr/bin/env node
/**
 * Offline source health check using fixtures + default registry.
 * Usage: node src/jobs/sample-source-health.job.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { resolveRegistry, PARSER_VERSION } from '../sources/source-registry.js';
import { orchestrateExtraction } from '../extraction/parser-orchestrator.js';
import { SourceQualityTracker } from '../validation/source-validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../fixtures');

const FIXTURE_MAP = [
    { file: 'enbd-listing.html', url: 'https://www.emiratesnbd.com/en/deals', sourceType: 'emiratesNbd' },
    { file: 'enbd-detail.html', url: 'https://www.emiratesnbd.com/en/deals/good-times/ferrari-world', sourceType: 'emiratesNbd' },
    { file: 'visa-listing.html', url: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/', sourceType: 'visaUAE' },
    { file: 'fab-mixed.html', url: 'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers', sourceType: 'fab' },
];

const registry = resolveRegistry();
const tracker = new SourceQualityTracker();
const report = { parserVersion: PARSER_VERSION, sources: {} };

for (const sample of FIXTURE_MAP) {
    const html = fs.readFileSync(path.join(FIXTURES, sample.file), 'utf8');
    const $ = cheerio.load(html);
    const rawText = $('body').text();
    const result = orchestrateExtraction(sample.url, $, rawText, html, { sourceTypeHint: sample.sourceType }, registry);

    tracker.recordPage(sample.url, rawText, html, $, sample.sourceType, result.offers.length ? 'emitted' : 'validation_fail');

    report.sources[sample.sourceType] = report.sources[sample.sourceType] || {
        fixtures: 0,
        offers: 0,
        pageTypes: [],
    };
    report.sources[sample.sourceType].fixtures += 1;
    report.sources[sample.sourceType].offers += result.offers.length;
    report.sources[sample.sourceType].pageTypes.push(result.pageInfo?.pageType);
}

report.quality = tracker.getSummary();
console.log(JSON.stringify(report, null, 2));
