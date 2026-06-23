/**
 * ENBD parser v2 — preserves strong listing/detail paths, excludes campaigns.
 */
import { PARSER_VERSION } from '../sources/source-registry.js';
import { matchEmiratesNbd, parseEmiratesNbd } from './emiratesNbdParser.js';

export const matchEnbd = matchEmiratesNbd;

export function parseEnbd($, url, rawText, rawHtml, meta = {}) {
    if (/\/campaigns\//i.test(url)) {
        return { offers: [], warnings: ['campaign_url_skipped'] };
    }

    const offers = parseEmiratesNbd($, url, rawText, rawHtml, meta)
        .filter((o) => !/\/campaigns\//i.test(o.sourceUrl || url));

    return enrich(offers, meta);
}

function enrich(offers, meta) {
    return {
        offers: offers.map((o) => ({
            ...o,
            parserName: 'enbdParser',
            parserVersion: PARSER_VERSION,
            pageType: meta.pageType || null,
        })),
        warnings: [],
    };
}
