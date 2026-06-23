#!/usr/bin/env node
/**
 * Offline tests for SERP discovery filtering (no network).
 */
import {
    parseGoogleSerpHtml,
    filterDiscoveryResults,
    isRelevantOfferResult,
    isDomainAllowed,
    isDeniedUrl,
    decodeGoogleResultUrl,
    inferSourceTypeFromUrl,
    normalizeSerpText,
    normalizeResultUrl,
    extractExistingUrls,
} from '../src/utils/serpDiscovery.js';

const SAMPLE_SERP = `
<html><body><div id="search">
  <div class="g">
    <a href="/url?q=https://www.emiratesnbd.com/en/deals&amp;sa=U"><h3>Emirates NBD Deals</h3></a>
    <div class="VwiC3b">Credit card offers and cashback in UAE</div>
  </div>
  <div class="g">
    <a href="/url?q=https://www.facebook.com/login&amp;sa=U"><h3>Facebook Login</h3></a>
  </div>
  <div class="g">
    <a href="https://www.visa.co.ae/en_AE/pay-with-visa/offers"><h3>Visa UAE Offers</h3></a>
    <div class="VwiC3b">Dining and shopping perks for Visa cardholders</div>
  </div>
</div></body></html>
`;

const tests = [
    ['decodeGoogleResultUrl', () => decodeGoogleResultUrl('/url?q=https://www.emiratesnbd.com/en/deals') === 'https://www.emiratesnbd.com/en/deals'],
    ['normalizeSerpText', () => normalizeSerpText('  Hello   world  ') === 'Hello world'],
    ['parseGoogleSerpHtml', () => parseGoogleSerpHtml(SAMPLE_SERP, 'Emirates NBD deals UAE', 10).length >= 2],
    ['filterDiscoveryResults', () => {
        const parsed = parseGoogleSerpHtml(SAMPLE_SERP, 'Emirates NBD deals UAE', 10);
        const filtered = filterDiscoveryResults(parsed, {
            allowedDomains: ['emiratesnbd.com', 'visa.co.ae'],
            denyPatterns: ['facebook'],
            maxResults: 10,
        });
        return filtered.length === 2 && filtered.every((r) => isDomainAllowed(r.url, ['emiratesnbd.com', 'visa.co.ae']));
    }],
    ['isDeniedUrl', () => isDeniedUrl('https://www.facebook.com/login', ['facebook'])],
    ['isRelevantOfferResult', () => isRelevantOfferResult('https://www.emiratesnbd.com/en/deals', 'ENBD Deals', 'cashback offers')],
    ['inferSourceTypeFromUrl', () => inferSourceTypeFromUrl('https://www.emiratesnbd.com/en/deals') === 'emiratesNbd'],
    ['extractExistingUrls dedupe', () => {
        const existing = extractExistingUrls([{ url: 'https://www.emiratesnbd.com/en/deals' }]);
        const parsed = parseGoogleSerpHtml(SAMPLE_SERP, 'q', 10);
        const filtered = filterDiscoveryResults(parsed, { existingUrls: existing, maxResults: 10 });
        return !filtered.some((r) => normalizeResultUrl(r.url) === 'https://www.emiratesnbd.com/en/deals');
    }],
];

let passed = 0;
for (const [name, fn] of tests) {
    if (fn()) {
        passed++;
        console.log(`✓ ${name}`);
    } else {
        console.error(`✗ ${name}`);
        process.exitCode = 1;
    }
}
console.log(`\n${passed}/${tests.length} discovery unit tests passed`);
