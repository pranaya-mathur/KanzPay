/**
 * @file discoveryCrawler.js
 * Scheduled Google SERP discovery — seeds main crawl queue with public offer URLs.
 * Not intended for live checkout / per-transaction use.
 */

import { chromium } from 'playwright';
import { KeyValueStore, log } from 'crawlee';
import {
    DEFAULT_DISCOVERY_QUERIES,
    buildGoogleSearchUrl,
    parseGoogleSerpHtml,
    filterDiscoveryResults,
    inferSourceTypeFromUrl,
    extractExistingUrls,
} from '../utils/serpDiscovery.js';

const QUERY_DELAY_MS = 2500;
const PAGE_DELAY_MS = 1500;

/**
 * Fetch one SERP page via Playwright.
 * @param {import('playwright').Page} page
 * @param {string} searchUrl
 */
async function fetchSerpPage(page, searchUrl) {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    return page.content();
}

/**
 * Run Google SERP discovery and return crawl seeds + structured discovery records.
 * @param {object} input Actor input
 * @param {object} [ctx]
 * @param {Array<string|object>} [ctx.startUrls] Used to dedupe against existing seeds
 * @returns {Promise<{ seeds: object[], discoveryResults: object[], stats: object }>}
 */
export async function runDiscovery(input, ctx = {}) {
    const queries = input.discoveryQueries?.length
        ? input.discoveryQueries
        : DEFAULT_DISCOVERY_QUERIES;

    const maxPerQuery = input.discoveryMaxResults ?? 10;
    const pages = Math.max(1, input.discoveryPages ?? 1);
    const country = input.discoveryCountry ?? 'ae';
    const language = input.discoveryLanguage ?? 'en';
    const allowedDomains = input.allowedDomains || [];
    const denyPatterns = input.denyPatterns || [];
    const existingUrls = extractExistingUrls(ctx.startUrls || input.startUrls || []);

    log.info(`Discovery start queries=${queries.length} pages=${pages} maxPerQuery=${maxPerQuery} country=${country}`);

    const allRaw = [];
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: language === 'ar' ? 'ar-AE' : 'en-AE',
        });
        const page = await context.newPage();

        for (const query of queries) {
            let rankOffset = 0;

            for (let pageIdx = 0; pageIdx < pages; pageIdx += 1) {
                const searchUrl = buildGoogleSearchUrl(query, country, language, pageIdx);
                log.info(`Discovery query="${query}" page=${pageIdx + 1}/${pages}`);

                try {
                    const html = await fetchSerpPage(page, searchUrl);
                    const parsed = parseGoogleSerpHtml(html, query, maxPerQuery, rankOffset);
                    log.info(`Discovery query="${query}" page=${pageIdx + 1} rawResults=${parsed.length}`);
                    allRaw.push(...parsed);
                    rankOffset += parsed.length;
                    if (parsed.length === 0) break; // no more pages worth fetching
                } catch (err) {
                    log.warning(`Discovery failed query="${query}" page=${pageIdx + 1} error=${err.message}`);
                }

                if (pageIdx < pages - 1) await page.waitForTimeout(PAGE_DELAY_MS);
            }

            await page.waitForTimeout(QUERY_DELAY_MS);
        }

        await context.close();
    } finally {
        await browser.close();
    }

    const discoveryResults = filterDiscoveryResults(allRaw, {
        allowedDomains,
        denyPatterns,
        maxResults: maxPerQuery * queries.length * pages,
        existingUrls,
    });

    log.info(`Discovery filtered=${discoveryResults.length} raw=${allRaw.length} skippedExisting=${existingUrls.length}`);

    const seeds = discoveryResults.map((r) => ({
        url: r.url,
        userData: {
            depth: 0,
            sourceType: inferSourceTypeFromUrl(r.url),
            discoveryQuery: r.discoveryQuery,
            discoverySource: r.discoverySource,
            serpRank: r.serpRank,
            serpTitle: r.title,
            serpSnippet: r.snippet,
            fromDiscovery: true,
        },
    }));

    const stats = {
        queriesRun: queries.length,
        pagesPerQuery: pages,
        rawResults: allRaw.length,
        filteredResults: discoveryResults.length,
        seeds: seeds.length,
        existingUrlsSkipped: existingUrls.length,
    };

    const payload = {
        timestamp: new Date().toISOString(),
        stats,
        queries,
        results: discoveryResults,
    };

    // Always persist discovery output for inspection (separate from offer dataset / dryRun)
    const store = await KeyValueStore.open();
    await store.setValue('DISCOVERY_RESULTS', payload);
    log.info('DISCOVERY_RESULTS written to key-value store');

    return { seeds, discoveryResults, stats };
}

/**
 * Merge discovery seeds with explicit startUrls; startUrls win dedupe priority.
 * @param {object[]} startUrls
 * @param {object[]} discoverySeeds
 */
export function mergeCrawlSeeds(startUrls, discoverySeeds) {
    const seen = new Set();
    const merged = [];

    const add = (req) => {
        const url = typeof req === 'string' ? req : req.url;
        if (!url) return;
        const key = url.toLowerCase().split('#')[0].split('?')[0].replace(/\/$/, '');
        if (seen.has(key)) return;
        seen.add(key);
        if (typeof req === 'string') {
            merged.push({ url: req, userData: { depth: 0 } });
        } else {
            merged.push({ ...req, userData: { depth: req.userData?.depth ?? 0, ...req.userData } });
        }
    };

    // startUrls first so manually seeded URLs take precedence
    for (const req of startUrls) add(req);
    for (const req of discoverySeeds) add(req);

    return merged;
}
