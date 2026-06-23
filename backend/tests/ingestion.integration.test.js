import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { validateRawCrawlOffer } from '../src/shared/schemas/offer.schema.js';
import { buildDiscoveryIndex, attachDiscoveryMetadata } from '../src/modules/ingestion/source-mapper.service.js';
import { evaluateDiscoveryPolicy } from '../src/modules/ingestion/discovery-policy.service.js';
import { normalizeRawOffer } from '../src/modules/ingestion/normalization.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../fixtures');

describe('Crawler to backend schema contract', () => {
    it('accepts ENBD fixture shape from crawler', () => {
        const html = fs.readFileSync(path.join(FIXTURES, 'enbd-detail.html'), 'utf8');
        const $ = cheerio.load(html);
        const rawText = $('body').text();
        const crawlRecord = {
            sourceUrl: 'https://www.emiratesnbd.com/en/deals/good-times/ferrari-world-yas-island',
            sourceType: 'emiratesNbd',
            offerTitle: 'Ferrari World Yas Island',
            offerDescription: rawText,
            discountType: 'percent',
            discountValue: 20,
            merchantName: 'Ferrari World Yas Island',
            parserName: 'enbdParser',
            parserVersion: '2.0.0',
            pageType: 'detail',
            schemaVersion: '1.0',
            confidence: 0.72,
            pageLength: rawText.length,
            scrapedAt: new Date().toISOString(),
        };
        const validated = validateRawCrawlOffer(crawlRecord);
        const normalized = normalizeRawOffer(validated);
        assert.equal(normalized.discountType, 'percent');
        assert.equal(normalized.schemaVersion, '1.0');
    });
});

describe('Discovery ingest contract', () => {
    it('enriches offers from DISCOVERY_RESULTS-style index', () => {
        const index = buildDiscoveryIndex([{
            url: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/',
            discoveryQuery: 'Visa UAE offers',
            serpRank: 1,
        }]);
        const raw = {
            sourceUrl: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/',
            sourceType: 'visaUAE',
            offerTitle: 'Save 15%',
            merchantName: 'Carluccios',
            discountType: 'percent',
            discountValue: 15,
            parserName: 'visaParser',
            confidence: 0.7,
        };
        const enriched = attachDiscoveryMetadata(raw, index);
        const policy = evaluateDiscoveryPolicy(normalizeRawOffer(enriched), null, index, { confidence: 0.7 });
        assert.equal(enriched.discoveryQuery, 'Visa UAE offers');
        assert.ok(['continue', 'quarantine'].includes(policy.action));
    });
});
