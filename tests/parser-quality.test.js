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
import { isCategoryHeaderTitle } from '../src/validation/quality-rules.js';

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
