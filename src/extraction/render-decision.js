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

    try {
        await page.waitForSelector(plan.waitSelector, { timeout: sourceType === 'visaUAE' ? 20000 : 15000 })
            .catch(() => log?.warning?.(`Wait selector timeout: ${url}`));

        if (sourceType === 'visaUAE') {
            await page.waitForFunction(
                () => document.querySelectorAll('.vs-card').length >= 3
                    || document.body?.innerText?.includes('%'),
                { timeout: 10000 },
            ).catch(() => {});
        }

        await page.waitForTimeout(plan.settleMs);
    } catch (err) {
        log?.debug?.(`Render wait error: ${err.message}`);
    }
}
