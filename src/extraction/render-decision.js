import { primaryWaitSelector, getSelectorsForSource } from './selector-fallbacks.js';
import { looksLikeJsShell, urlNeedsBrowser } from '../utils/linkFilter.js';

export function getRenderPlan(url, sourceType, pageInfo = {}, crawlerType = 'cheerio') {
    const selectors = getSelectorsForSource(sourceType);
    const waitSelector = primaryWaitSelector(sourceType);
    const settleMs = sourceType === 'visaUAE' ? 2500 : 2000;

    const needsPlaywright = crawlerType === 'playwright'
        || pageInfo.needsRender
        || urlNeedsBrowser(url, sourceType)
        || (pageInfo.pageType === 'shell');

    return {
        needsPlaywright,
        waitSelector,
        settleMs,
        cardSelectors: selectors.cards,
        retryWithBrowser: !needsPlaywright && (pageInfo.needsRender || looksLikeJsShell('', '')),
    };
}

export async function applyRenderWaits(page, url, sourceType, log) {
    const plan = getRenderPlan(url, sourceType, {}, 'playwright');
    if (!page) return;

    const timeout = sourceType === 'visaUAE' ? 20000
        : (sourceType === 'mashreq' || sourceType === 'fab') ? 30000 : 15000;

    try {
        await page.waitForSelector(plan.waitSelector, { timeout })
            .catch(() => log?.warning?.(`Wait selector timeout: ${url}`));

        if (sourceType === 'visaUAE') {
            await page.waitForFunction(
                () => document.querySelectorAll('.vs-card').length >= 3
                    || document.body?.innerText?.includes('%'),
                { timeout: 10000 },
            ).catch(() => {});
        }

        if (sourceType === 'mashreq') {
            await page.waitForFunction(
                () => document.querySelectorAll('.ui-card h6, .ui-card h5').length >= 1
                    || document.querySelectorAll('a[href*="/neo/offers/"]').length >= 2
                    || document.body?.innerText?.length > 400,
                { timeout: 15000 },
            ).catch(() => {});

            for (let i = 0; i < 3; i += 1) {
                await page.evaluate(() => {
                    window.scrollBy(0, window.innerHeight * 0.9);
                }).catch(() => {});
                await page.waitForTimeout(800);
            }
        }

        if (sourceType === 'fab') {
            await page.waitForFunction(
                () => document.querySelectorAll('a[href*="offer"]').length >= 2
                    || document.body?.innerText?.includes('cashback'),
                { timeout: 12000 },
            ).catch(() => {});
        }

        await page.waitForTimeout(plan.settleMs);
    } catch (err) {
        log?.debug?.(`Render wait error: ${err.message}`);
    }
}
