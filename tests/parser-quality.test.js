#!/usr/bin/env node
/**
 * Parser quality tests with real HTML fixtures.
 * Usage: npm run test:quality
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { orchestrateExtraction } from '../src/extraction/parser-orchestrator.js';
import { detectPageType } from '../src/extraction/page-type-detector.js';
import { isCategoryHeaderTitle, isAdcbNavNoise } from '../src/validation/quality-rules.js';
import { detectDiscountType, isInstalmentContext } from '../src/utils/extractPatterns.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '../fixtures');

function loadFixture(name) {
    return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function parseFixture(name, url, sourceType) {
    const html = loadFixture(name);
    const $ = cheerio.load(html);
    const rawText = $('body').text();
    return orchestrateExtraction(url, $, rawText, html, { sourceTypeHint: sourceType });
}

test('ENBD listing extracts merchant offers', () => {
    const result = parseFixture(
        'enbd-listing.html',
        'https://www.emiratesnbd.com/en/deals',
        'emiratesNbd',
    );
    assert.ok(result.offers.length >= 1);
    assert.equal(result.pageInfo.pageType, 'listing');
    assert.ok(result.offers[0].merchantName || result.offers[0].offerTitle);
    assert.ok(result.offers[0].parserVersion);
});

test('ENBD detail preserves discount extraction', () => {
    const result = parseFixture(
        'enbd-detail.html',
        'https://www.emiratesnbd.com/en/deals/good-times/ferrari-world-yas-island',
        'emiratesNbd',
    );
    assert.ok(result.offers.length >= 1);
    assert.equal(result.offers[0].discountType, 'percent');
    assert.equal(result.offers[0].discountValue, 20);
});

test('Visa listing extracts multiple merchant cards', () => {
    const result = parseFixture(
        'visa-listing.html',
        'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/',
        'visaUAE',
    );
    assert.ok(result.offers.length >= 2);
    assert.ok(result.offers.every((o) => o.pageType === 'listing'));
});

test('Visa generic detail shell is skipped', () => {
    const html = loadFixture('visa-shell-detail.html');
    const $ = cheerio.load(html);
    const rawText = $('body').text();
    const pageInfo = detectPageType(
        'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/cards-rewards/999',
        rawText,
        html,
        $,
        'visaUAE',
    );
    assert.equal(pageInfo.pageType, 'category');
    const result = orchestrateExtraction(
        'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/cards-rewards/999',
        $,
        rawText,
        html,
        { sourceTypeHint: 'visaUAE' },
    );
    assert.equal(result.offers.length, 0);
});

test('FAB filters category headers', () => {
    assert.ok(isCategoryHeaderTitle('Seasonal Offers', 'fab'));
    const result = parseFixture(
        'fab-mixed.html',
        'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers',
        'fab',
    );
    assert.ok(result.offers.length >= 1);
    assert.ok(result.offers.every((o) => !isCategoryHeaderTitle(o.offerTitle, 'fab')));
});

test('Shell page emits no offers', () => {
    const html = loadFixture('shell-page.html');
    const $ = cheerio.load(html);
    const rawText = $('body').text();
    const pageInfo = detectPageType('https://example.com/offers', rawText, html, $, 'generic');
    assert.equal(pageInfo.pageType, 'shell');
    const result = orchestrateExtraction('https://example.com/offers', $, rawText, html, {});
    assert.equal(result.offers.length, 0);
});

test('FAB rejects cookie consent noise', () => {
    const cookieText = 'Preference cookies enable a website to remember information that changes the way the website behaves or looks, like your preferred language or the region that you are in. NameProviderPurposeMaximum Storage DurationTypefab2#langwww.bankfab.comStores the user\'s preferred language setting';
    const html = `<html><body><article><h3>${cookieText}</h3></article></body></html>`;
    const $ = cheerio.load(html);
    const result = orchestrateExtraction(
        'https://www.bankfab.com/en-ae/personal/credit-cards/offers',
        $,
        cookieText,
        html,
        { sourceTypeHint: 'fab' },
    );
    assert.equal(result.offers.length, 0);
});

test('ADCB listing tags TouchPoints burns and rejects nav noise', () => {
    const result = parseFixture(
        'adcb-listing.html',
        'https://www.adcb.com/en/personal/credit-cards/offers.aspx',
        'adcb',
    );
    assert.ok(result.offers.length >= 1);
    assert.ok(result.offers.some((o) => o.merchantName === 'talabat' && (o.categories || []).includes('touchpoints_burn')));
    assert.ok(result.offers.some((o) => /pizza hut/i.test(`${o.merchantName} ${o.offerTitle} ${o.offerDescription}`)));
    assert.ok(result.offers.every((o) => !isAdcbNavNoise(o.merchantName || '')));
});

test('HSBC detail page extracts merchant discount (not instalment false positive)', () => {
    const result = parseFixture(
        'hsbc-detail.html',
        'https://www.hsbc.ae/credit-cards/special-offers/agoda-20-off-31-12-2026/',
        'hsbc',
    );
    assert.ok(result.offers.length >= 1);
    assert.equal(result.offers[0].discountType, 'percent');
    assert.equal(result.offers[0].discountValue, 20);
    assert.ok(/agoda/i.test(result.offers[0].offerTitle));
});

test('AED 5,000 cashback extracts fixed value', () => {
    const { discountType, discountValue } = detectDiscountType('Get up-to AED 5,000 cash-back with early bird offers');
    assert.equal(discountType, 'cashback');
    assert.equal(discountValue, '5000');
});

test('AED 1,000 instalment text does not yield discount_value=1', () => {
    const text = 'Flexi instalment plans on purchases starting at AED 1,000';
    assert.ok(isInstalmentContext(text));
    const { discountType, discountValue } = detectDiscountType(text);
    assert.equal(discountType, null);
    assert.equal(discountValue, null);
});

test('HSBC listing emits slug offers with checkout discounts', () => {
    const html = `<html><body><main>
      <h1>Credit and debit card special offers</h1>
      <p>Enjoy exclusive discounts and cashback with HSBC credit cards across dining, travel and shopping partners in the UAE.</p>
      <a href="/credit-cards/special-offers/agoda-20-off-31-12-2026/">Agoda 20% off valid until 31-12-2026</a>
      <a href="/credit-cards/special-offers/flexi-instalment-plans-31-12-2026/">Instalment only</a>
      <a href="/credit-cards/special-offers/">Back</a>
    </main></body></html>`;
    const $ = cheerio.load(html);
    const rawText = $('body').text();
    const result = orchestrateExtraction(
        'https://www.hsbc.ae/credit-cards/special-offers/',
        $,
        rawText,
        html,
        { sourceTypeHint: 'hsbc' },
    );
    assert.equal(result.parserName, 'hsbcParser');
    assert.equal(result.offers.length, 1);
    assert.equal(result.offers[0].discountValue, 20);
    assert.equal(result.offers[0].merchantName, 'Agoda');
});

test('Mashreq listing extracts offer cards from ui-card layout', () => {
    const result = parseFixture(
        'mashreq-listing.html',
        'https://www.mashreq.com/en/uae/neo/offers/',
        'mashreq',
    );
    assert.ok(result.offers.length >= 1, `expected offers, got ${result.offers.length}`);
    assert.ok(result.offers.some((o) => /early bird|salary transfer|cashback/i.test(`${o.offerTitle} ${o.merchantName || ''}`)));
});

test('HSBC listing fixture has enqueueable slug URLs', async () => {
    const { shouldEnqueueUrl } = await import('../src/discovery/enqueue-rules.js');
    const decision = shouldEnqueueUrl(
        'https://www.hsbc.ae/credit-cards/special-offers/agoda-enjoy-up-to-20-off-worldwide-hotel-bookings-31-08-2026/',
        'hsbc',
        0,
    );
    assert.equal(decision.enqueue, true);
    assert.equal(decision.reason, 'hsbc_detail_slug');
});

test('Default registry excludes coupon aggregators', async () => {
    const { selectCrawlSources } = await import('../src/sources/source-selector.js');
    const selection = selectCrawlSources({ useSourceRegistry: true });
    const types = selection.startUrls.map((u) => u.userData.sourceType);
    assert.ok(types.includes('fab'), 'fab should be included');
    assert.ok(types.includes('adib'), 'adib should be included');
    assert.ok(!types.includes('groupon'), 'groupon should be excluded by default');
    assert.ok(types.includes('emiratesNbd'), 'emiratesNbd should be included');
    assert.ok(types.includes('mashreq'), 'mashreq should be included');
    assert.ok(selection.startUrls.some((u) => u.url.includes('hsbc.ae/credit-cards/special-offers')));
    assert.ok(selection.startUrls.some((u) => u.url.includes('mashreq.com/en/uae/neo/offers/early-bird')));
});

test('Mashreq API payload yields merchant discounts and excludes vantage noise', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const { parseMashreqApiPayload } = await import('../src/parsers/mashreq-api.parser.js');
    const { isMashreqVantageNoise } = await import('../src/validation/quality-rules.js');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/mashreq-offers-api.json'), 'utf8'));
    const offers = parseMashreqApiPayload(
        json,
        'https://www.mashreq.com/en/uae/neo/offers/',
        { crawlDepth: 0 },
    );
    assert.ok(offers.length >= 20, `expected API offers, got ${offers.length}`);
    assert.ok(offers.some((o) => o.discountType === 'percent' && Number(o.discountValue) >= 20));
    assert.ok(offers.every((o) => !isMashreqVantageNoise(`${o.offerTitle} ${o.offerDescription}`)));
    assert.ok(!offers.some((o) => (o.categories || []).includes('points_redemption')));
});

test('HSBC instalment slug is skipped on detail parse', async () => {
    const { parseHsbc } = await import('../src/parsers/hsbc.parser.js');
    const cheerio = await import('cheerio');
    const html = '<html><body><h1>Flexi instalment plans</h1><p>0% instalment on purchases</p></body></html>';
    const $ = cheerio.load(html);
    const result = parseHsbc(
        $,
        'https://www.hsbc.ae/credit-cards/special-offers/flexi-instalment-plans-31-12-2026/',
        $('body').text(),
        html,
        {},
    );
    assert.equal(result.offers.length, 0);
});

test('HSBC slug extractor infers percent discount and merchant', async () => {
    const { extractHsbcFromSlug } = await import('../src/parsers/hsbc.parser.js');
    const hints = extractHsbcFromSlug('https://www.hsbc.ae/credit-cards/special-offers/agoda-20-off-31-12-2026/');
    assert.equal(hints.discountValue, 20);
    assert.equal(hints.merchant, 'Agoda');
    assert.ok(hints.validTo);
    const booking = extractHsbcFromSlug('https://www.hsbc.ae/credit-cards/special-offers/booking-com-up-to-8-percent-off-on-accommodation-31-12-2026/');
    assert.equal(booking.discountValue, 8);
});

test('DIB card-offers listing extracts multiple merchant offers', () => {
    const result = parseFixture(
        'dib-listing.html',
        'https://www.dib.ae/offers/card-offers',
        'dib',
    );
    assert.ok(result.offers.length >= 5, `expected dib offers, got ${result.offers.length}`);
    assert.ok(result.offers.some((o) => /shein|jashanmal/i.test(`${o.merchantName} ${o.offerTitle}`)));
    assert.ok(result.offers.some((o) => Number(o.discountValue) > 1));
});
