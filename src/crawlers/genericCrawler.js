/**
 * @file genericCrawler.js
 * Page processing, quality gate, deduplication, link enqueue, and snapshots.
 */

import { Dataset, KeyValueStore } from 'crawlee';
import * as cheerio from 'cheerio';
import { orchestrateExtraction } from '../extraction/parser-orchestrator.js';
import { applyRenderWaits } from '../extraction/render-decision.js';
import { getRenderPlan } from '../extraction/render-decision.js';
import { OfferDeduplicator } from '../utils/dedupe.js';
import { buildEnqueueGlobs, buildEnqueueSelector, buildEnqueueExclude } from '../discovery/link-filter.js';
import { shouldEnqueueUrl } from '../discovery/enqueue-rules.js';
import { isPdfUrl, extractTextFromPdfBuffer } from '../utils/pdfExtract.js';
import { SourceQualityTracker } from '../validation/source-validation.js';
import { resolveRegistry } from '../sources/source-registry.js';

const deduplicator = new OfferDeduplicator();
const qualityTracker = new SourceQualityTracker();
const LOW_CONFIDENCE_SNAPSHOT = 0.35;

/**
 * Process a single crawled page: extract, normalize, gate, dedupe, push.
 */
export async function processPage(ctx) {
    const { request, $, page, log, input, crawlerType } = ctx;
    const url = request.url;
    const crawlDepth = request.userData.depth || 0;
    const sourceTypeHint = request.userData.sourceType || null;
    const registry = input.sourceRegistry || resolveRegistry(input);

    log.info(`[${crawlerType}] depth=${crawlDepth} url=${url}`);

    let rawText = '';
    let rawHtml = '';
    let contentType = '';
    let parsed$ = $;

    try {
        if (page) {
            await applyRenderWaits(page, url, sourceTypeHint, log);
            rawText = await page.evaluate(() => document.body?.innerText || '');
            rawHtml = await page.content();
            contentType = 'text/html';
        } else if ($) {
            rawText = $('body').text() || '';
            rawHtml = $.html();
            contentType = ctx.response?.headers?.['content-type'] || 'text/html';
        }

        if (!parsed$ && rawHtml) {
            parsed$ = cheerio.load(rawHtml);
        }

        if (isPdfUrl(url) || contentType.includes('application/pdf')) {
            const pdfBuffer = ctx.body || ctx.response?.body;
            if (pdfBuffer) {
                rawText = extractTextFromPdfBuffer(Buffer.from(pdfBuffer));
                log.info(`PDF text extracted: ${rawText.length} chars from ${url}`);
            }
        }
    } catch (err) {
        log.error(`Content extraction failed url=${url} error=${err.message}`);
        return { offersPushed: 0, needsBrowserRetry: false, validOffers: [] };
    }

    const pageLength = rawText.length;
    log.info(`pageLength=${pageLength} orchestrating extraction for ${url}`);

    const extraction = orchestrateExtraction(
        url, parsed$, rawText, rawHtml,
        { sourceTypeHint, crawlDepth },
        registry,
    );

    const { parserName, reason, pageInfo, extractionWarnings, debugRecord, skippedOffers } = extraction;
    log.info(`parserName=${parserName} pageType=${pageInfo?.pageType} parserReason="${reason}" warnings=${extractionWarnings?.length || 0}`);

    let offersPushed = 0;
    const validOffers = [];

    for (const normalized of extraction.offers) {
        normalized.includeHtml = input.includeHtml;
        normalized.includeText = input.includeText;
        if (request.userData.discoveryQuery) normalized.discoveryQuery = request.userData.discoveryQuery;
        if (request.userData.discoverySource) normalized.discoverySource = request.userData.discoverySource;
        if (request.userData.serpRank != null) normalized.serpRank = request.userData.serpRank;
        if (request.userData.fromDiscovery) normalized.fromDiscovery = true;

        if (deduplicator.isDuplicate(normalized)) {
            log.debug(`Duplicate skipped: "${normalized.offerTitle}" @ ${url}`);
            continue;
        }

        validOffers.push(normalized);
        if (!input.dryRun) await Dataset.pushData(normalized);
        offersPushed += 1;

        log.info(`extracted offer title="${normalized.offerTitle}" confidence=${normalized.confidence} pageType=${normalized.pageType}`);
    }

    const outcome = offersPushed > 0 ? 'emitted' : (skippedOffers?.length ? 'validation_fail' : 'no_offers');
    qualityTracker.recordPage(url, rawText, rawHtml, parsed$, sourceTypeHint || extraction.parserId, outcome);

    if (skippedOffers?.length) {
        log.debug(`Validation skipped ${skippedOffers.length} offers on ${url}: ${skippedOffers.map((s) => s.reasons.join(',')).join('; ')}`);
    }

    log.info(`extractedCount=${offersPushed} parserName=${parserName} crawlDepth=${crawlDepth} pageLength=${pageLength}`);

    const shouldSnapshot = input.debug || input.saveSnapshots || offersPushed === 0
        || validOffers.some((o) => o.confidence < LOW_CONFIDENCE_SNAPSHOT);

    if (shouldSnapshot && (offersPushed === 0 || input.debug)) {
        await saveSnapshot({
            url, parserName, reason, pageLength, crawlDepth, crawlerType,
            rawText, rawHtml, offersPushed, pageInfo, debugRecord, skippedOffers, log,
        });
    }

    const renderPlan = getRenderPlan(url, sourceTypeHint, pageInfo, crawlerType);
    const needsBrowserRetry = offersPushed === 0
        && crawlerType === 'cheerio'
        && !request.userData.browserRetried
        && (renderPlan.retryWithBrowser || renderPlan.needsPlaywright);

    if (needsBrowserRetry) {
        log.warning(`Scheduling Playwright retry: ${url} reason=${pageInfo?.reason || 'render_needed'}`);
    }

    return { offersPushed, needsBrowserRetry, validOffers, pageInfo };
}

export async function enqueueLinks(crawlerContext, input) {
    const { enqueueLinks: crawleeEnqueue, log, request } = crawlerContext;
    const currentDepth = request.userData.depth || 0;
    const nextDepth = currentDepth + 1;
    const sourceType = request.userData.sourceType || null;
    const globs = buildEnqueueGlobs(input.allowedDomains);
    const selector = buildEnqueueSelector(sourceType);
    const exclude = buildEnqueueExclude(sourceType);

    const result = await crawleeEnqueue({
        globs,
        selector,
        exclude,
        strategy: 'same-domain',
        transformRequestFunction(req) {
            const enqueueDecision = shouldEnqueueUrl(req.url, sourceType, currentDepth);
            if (!enqueueDecision.enqueue) {
                log.debug(`skip link reason=${enqueueDecision.reason} url=${req.url}`);
                return false;
            }
            if (input.denyPatterns?.some((p) => new RegExp(p, 'i').test(req.url))) {
                log.debug(`skip link denyPattern url=${req.url}`);
                return false;
            }
            req.userData = {
                ...req.userData,
                depth: nextDepth,
                sourceType: req.userData?.sourceType || sourceType,
                discoveryQuery: req.userData?.discoveryQuery || request.userData.discoveryQuery || null,
                discoverySource: req.userData?.discoverySource || request.userData.discoverySource || null,
                serpRank: req.userData?.serpRank ?? request.userData.serpRank ?? null,
                fromDiscovery: req.userData?.fromDiscovery || request.userData.fromDiscovery || false,
            };
            return req;
        },
    });
    log.info(`enqueue depth=${currentDepth} added=${result?.processedRequests?.length ?? 0} url=${request.url}`);
}

async function saveSnapshot({
    url, parserName, reason, pageLength, crawlDepth, crawlerType,
    rawText, rawHtml, offersPushed, pageInfo, debugRecord, skippedOffers, log,
}) {
    const key = `snapshot-${Buffer.from(url).toString('base64url').slice(0, 48)}`;
    const store = await KeyValueStore.open();
    await store.setValue(key, {
        url, parserName, parserReason: reason, pageLength, crawlDepth,
        crawlerType, offersPushed, pageType: pageInfo?.pageType,
        skippedOffers, debugRecord,
        rawText: (rawText || '').slice(0, 12000),
        rawHtml: rawHtml ? rawHtml.slice(0, 25000) : undefined,
        timestamp: new Date().toISOString(),
    });
    log.warning(`Snapshot saved key=${key} offersPushed=${offersPushed} pageType=${pageInfo?.pageType}`);
}

export function getDedupeStats() {
    return deduplicator.getStats();
}

export function getQualityStats() {
    return qualityTracker.getSummary();
}

export async function saveRunSummary(input, stats) {
    if (input.dryRun) return;
    const store = await KeyValueStore.open();
    await store.setValue('RUN_SUMMARY', {
        ...stats,
        qualityBySource: getQualityStats(),
        timestamp: new Date().toISOString(),
    });
}
