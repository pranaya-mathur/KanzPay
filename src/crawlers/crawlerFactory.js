/**
 * @file crawlerFactory.js
 * Explicit Cheerio vs Playwright crawler selection and factory.
 */

import { CheerioCrawler, PlaywrightCrawler, log } from 'crawlee';

/**
 * Select crawler type for the initial crawl phase.
 * In `auto` mode always starts with Cheerio; Playwright retry is handled in main.js.
 * @param {object} input Actor input
 * @returns {'cheerio'|'playwright'}
 */
export function selectCrawlerType(input) {
    const mode = input.crawlerMode || 'auto';

    if (mode === 'cheerio') {
        log.info('Crawler selection: CheerioCrawler (crawlerMode=cheerio)');
        return 'cheerio';
    }
    if (mode === 'playwright' || input.useBrowser === true) {
        log.info('Crawler selection: PlaywrightCrawler (crawlerMode=playwright)');
        return 'playwright';
    }

    // auto: Cheerio first, Playwright retry phase in main.js
    log.info('Crawler selection: CheerioCrawler (crawlerMode=auto — Playwright retry on JS shells)');
    return 'cheerio';
}

/**
 * @param {'cheerio'|'playwright'} type
 * @param {object} options
 * @returns {CheerioCrawler|PlaywrightCrawler}
 */
export function createCrawler(type, { requestHandler, maxRequestsPerCrawl, maxRequestRetries = 3 }) {
    const common = {
        requestHandler,
        maxRequestsPerCrawl,
        maxRequestRetries,
        retryOnBlocked: true,
        requestHandlerTimeoutSecs: 120,
        failedRequestHandler({ request, log: reqLog }, error) {
            reqLog.error(`Request failed url=${request.url} error=${error.message}`);
        },
    };

    if (type === 'playwright') {
        return new PlaywrightCrawler({
            ...common,
            headless: true,
            launchContext: {
                launchOptions: { args: ['--disable-gpu', '--no-sandbox'] },
            },
            preNavigationHooks: [
                async ({ page, request }) => {
                    page.setDefaultTimeout(30000);
                    if (/cbd\.ae/i.test(request.url)) {
                        await page.setExtraHTTPHeaders({
                            'Accept-Language': 'en-AE,en;q=0.9',
                            Referer: 'https://www.cbd.ae/',
                        });
                    }
                    if (/mashreq\.com.*\/neo\/offers/i.test(request.url)) {
                        request.userData.mashreqApiPayload = null;
                        page.on('response', async (res) => {
                            if (!/mashreq\.com\/api\/gql/i.test(res.url()) || res.status() !== 200) return;
                            try {
                                const json = await res.json();
                                if (json?.[0]?.data?.search?.results?.items?.length) {
                                    request.userData.mashreqApiPayload = json;
                                }
                            } catch { /* ignore parse errors */ }
                        });
                    }
                },
            ],
        });
    }

    return new CheerioCrawler({ ...common, maxConcurrency: 5 });
}
