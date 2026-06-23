import { Actor } from 'apify';
import { log } from 'crawlee';
import { selectCrawlerType, createCrawler } from './crawlers/crawlerFactory.js';
import { runDiscovery, mergeCrawlSeeds } from './crawlers/discoveryCrawler.js';
import {
    processPage, enqueueLinks, getDedupeStats, getQualityStats, saveRunSummary,
} from './crawlers/genericCrawler.js';
import { selectCrawlSources } from './sources/source-selector.js';

await Actor.init();

const rawInput = await Actor.getInput() || {};
const crawlSelection = selectCrawlSources(rawInput);
const input = {
    ...rawInput,
    startUrls: rawInput.debugUrl ? rawInput.startUrls : (crawlSelection.startUrls.length ? crawlSelection.startUrls : rawInput.startUrls),
    allowedDomains: rawInput.allowedDomains || crawlSelection.allowedDomains,
    sourceRegistry: crawlSelection.registry,
};

const {
    startUrls = [],
    maxDepth = input.maxDepth ?? crawlSelection.registry?.maxDepth ?? 1,
    maxRequestsPerCrawl = 300,
    debug = false,
    debugUrl = null,
    crawlerMode = input.crawlerMode ?? crawlSelection.registry?.crawlerMode ?? 'auto',
    discoveryEnabled = false,
} = input;

if (crawlSelection.sourceFilter === 'registry') {
    log.info(`Source registry active: ${crawlSelection.startUrls.length} approved/probation URLs`);
}

if (debug || debugUrl) {
    log.setLevel(log.LEVELS.DEBUG);
    log.info('DEBUG mode: verbose logging enabled');
}

const hasStartUrls = startUrls.length > 0 || debugUrl;
if (!hasStartUrls && !discoveryEnabled) {
    log.warning('No startUrls, debugUrl, or discoveryEnabled provided.');
    await Actor.exit();
}

// Phase 0: Google SERP discovery (scheduled ingestion only — skip in debug single-URL mode)
let discoveryStats = null;
let discoverySeeds = [];

if (discoveryEnabled && !debugUrl) {
    log.info('Phase 0: Google SERP discovery (scheduled ingestion — not live checkout)');
    const discovery = await runDiscovery(input, { startUrls });
    discoverySeeds = discovery.seeds;
    discoveryStats = discovery.stats;
    log.info(`Discovery complete seeds=${discoveryStats.seeds} filtered=${discoveryStats.filteredResults}`);
}

// Build crawl queue: explicit startUrls + discovered URLs (deduped)
const explicitRequests = debugUrl
    ? [{ url: debugUrl, userData: { depth: 0, sourceType: input.debugSourceType || null } }]
    : startUrls.map((req) => {
        if (typeof req === 'string') return { url: req, userData: { depth: 0 } };
        return { ...req, userData: { depth: req.userData?.depth ?? 0, ...req.userData } };
    });

const requests = debugUrl
    ? explicitRequests
    : mergeCrawlSeeds(explicitRequests, discoverySeeds);

if (requests.length === 0) {
    log.warning('No crawl URLs after discovery + startUrls merge.');
    await Actor.exit();
}

log.info(`KanzPay actor start urls=${requests.length} crawlerMode=${crawlerMode} maxDepth=${maxDepth} maxRequests=${maxRequestsPerCrawl} dryRun=${!!input.dryRun}`);

const initialCrawlerType = selectCrawlerType(input);
const browserRetryQueue = [];

const requestHandler = async (context) => {
    const result = await processPage({ ...context, input, crawlerType: initialCrawlerType });

    if (result.needsBrowserRetry) {
        browserRetryQueue.push({
            url: context.request.url,
            userData: { ...context.request.userData, browserRetried: true },
        });
    }

    const currentDepth = context.request.userData.depth || 0;
    if (currentDepth < maxDepth) {
        await enqueueLinks(context, input);
    }
};

const crawler = createCrawler(initialCrawlerType, {
    requestHandler,
    maxRequestsPerCrawl,
    maxRequestRetries: input.maxRequestRetries ?? 3,
});

await crawler.addRequests(requests);
await crawler.run();

// Phase 2: Playwright retry for JS-rendered pages (auto mode)
const shouldRetryWithBrowser = browserRetryQueue.length > 0
    && initialCrawlerType === 'cheerio'
    && crawlerMode !== 'cheerio';

if (shouldRetryWithBrowser) {
    log.info(`Phase 2 Playwright retry: ${browserRetryQueue.length} URLs`);
    const pwCrawler = createCrawler('playwright', {
        requestHandler: async (context) => {
            await processPage({ ...context, input, crawlerType: 'playwright' });
            const d = context.request.userData.depth || 0;
            if (d < maxDepth) await enqueueLinks(context, input);
        },
        maxRequestsPerCrawl: browserRetryQueue.length + maxRequestsPerCrawl,
        maxRequestRetries: input.maxRequestRetries ?? 3,
    });
    await pwCrawler.addRequests(browserRetryQueue);
    await pwCrawler.run();
}

const dedupeStats = getDedupeStats();
const qualityStats = getQualityStats();
log.info(`Crawl complete uniqueOffers=${dedupeStats.unique} duplicatesSkipped=${dedupeStats.duplicatesSkipped}`);
log.info(`Quality by source: ${JSON.stringify(qualityStats)}`);

await saveRunSummary(input, {
    initialCrawlerType,
    dedupeStats,
    qualityStats,
    discoveryStats,
    sourceFilter: crawlSelection.sourceFilter,
    dryRun: !!input.dryRun,
    debug: !!(debug || debugUrl),
    browserRetries: browserRetryQueue.length,
    crawlUrlCount: requests.length,
});

if (input.dryRun) log.info('Dry-run complete — dataset not written');

await Actor.exit();
