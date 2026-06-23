/**
 * @file serpDiscovery.js
 * Google SERP discovery — public organic URLs only, zero paid APIs.
 * Scheduled ingestion only; not for live checkout / per-transaction use.
 */

import * as cheerio from 'cheerio';

/** Default scheduled discovery queries for UAE offers. */
export const DEFAULT_DISCOVERY_QUERIES = [
    // Core banks
    'Emirates NBD credit card deals offers UAE',
    'ADCB credit card offers promotions UAE',
    'Mashreq bank credit card offers UAE',
    'FAB First Abu Dhabi Bank credit card offers UAE',
    'RAK Bank credit card offers UAE',
    'DIB Dubai Islamic Bank card offers UAE',
    'HSBC UAE credit card offers promotions',
    'Citibank UAE credit card promotions',
    'CBD Commercial Bank Dubai card offers',
    // Card networks
    'Visa UAE offers perks credit card',
    'Mastercard UAE promotions offers',
    // Coupon aggregators
    'UAE coupon code promo 2024',
    'UAE cashback coupon site',
    // Loyalty & deals
    'Smiles ENOC rewards offers UAE',
    'Noon UAE discount coupon offer',
];

const BLOCKED_HOSTS = new Set([
    'google.com', 'google.ae', 'googleusercontent.com', 'gstatic.com',
    'youtube.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
    'wikipedia.org', 'linkedin.com', 'tiktok.com', 'pinterest.com', 'reddit.com',
    'amazon.com', 'play.google.com', 'accounts.google.com',
]);

const BLOCKED_PATH_RE = /\/(?:login|signin|sign-in|signup|register|account|privacy|policy|terms|help|support|careers|cookie)\b/i;

const OFFER_RELEVANCE_KEYWORDS = [
    'offer', 'deal', 'promo', 'promotion', 'coupon', 'cashback', 'discount',
    'bank', 'card', 'visa', 'mastercard', 'emirates nbd', 'enbd', 'fab',
    'credit card', 'debit card', 'reward', 'perk', 'voucher', 'uae',
];

const RESULTS_PER_PAGE = 10;

/**
 * Normalize a crawl/discovery URL for deduplication.
 * @param {string} url
 * @returns {string|null}
 */
export function normalizeResultUrl(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        u.hash = '';
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach((p) => {
            u.searchParams.delete(p);
        });
        let out = u.toString();
        if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1);
        return out;
    } catch {
        return null;
    }
}

/**
 * Clean SERP title/snippet text.
 * @param {string} text
 * @returns {string}
 */
export function normalizeSerpText(text) {
    if (!text) return '';
    return String(text)
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\.{3,}/g, '…')
        .trim();
}

/**
 * Build a Google search URL for public SERP scraping.
 * @param {string} query
 * @param {string} [country='ae']
 * @param {string} [language='en']
 * @param {number} [page=0] Zero-based page index
 */
export function buildGoogleSearchUrl(query, country = 'ae', language = 'en', page = 0) {
    const params = new URLSearchParams({
        q: query,
        gl: country,
        hl: language,
        num: String(RESULTS_PER_PAGE),
        start: String(page * RESULTS_PER_PAGE),
        pws: '0',
    });
    return `https://www.google.com/search?${params.toString()}`;
}

/**
 * Decode Google redirect URLs (/url?q=...).
 * @param {string} href
 * @returns {string|null}
 */
export function decodeGoogleResultUrl(href) {
    if (!href) return null;
    try {
        if (href.startsWith('/url?')) {
            const u = new URL(href, 'https://www.google.com');
            return u.searchParams.get('q') || u.searchParams.get('url');
        }
        if (href.startsWith('http://') || href.startsWith('https://')) {
            return href;
        }
    } catch { /* ignore */ }
    return null;
}

/**
 * @param {string} url
 * @returns {string|null}
 */
export function getHostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

/**
 * @param {string} url
 * @param {string[]} [allowedDomains]
 */
export function isDomainAllowed(url, allowedDomains) {
    if (!allowedDomains || allowedDomains.length === 0) return true;
    const host = getHostname(url);
    if (!host) return false;
    return allowedDomains.some((d) => {
        const domain = d.replace(/^www\./, '').replace(/^\*\./, '');
        return host === domain || host.endsWith(`.${domain}`);
    });
}

/**
 * @param {string} url
 * @param {string[]} [denyPatterns]
 */
export function isDeniedUrl(url, denyPatterns = []) {
    if (!denyPatterns.length) return false;
    return denyPatterns.some((p) => {
        try {
            return new RegExp(p, 'i').test(url);
        } catch {
            return url.toLowerCase().includes(String(p).toLowerCase());
        }
    });
}

/**
 * @param {string} host
 */
export function isBlockedHost(host) {
    if (!host) return true;
    const h = host.replace(/^www\./, '');
    if (BLOCKED_HOSTS.has(h)) return true;
    return [...BLOCKED_HOSTS].some((b) => h === b || h.endsWith(`.${b}`));
}

/**
 * @param {string} url
 */
export function isBlockedPath(url) {
    return BLOCKED_PATH_RE.test(url);
}

/**
 * Relevance check for bank / card / merchant / coupon / deal pages.
 * @param {string} url
 * @param {string} title
 * @param {string} snippet
 */
export function isRelevantOfferResult(url, title = '', snippet = '') {
    if (isBlockedPath(url)) return false;
    const lower = `${url} ${title} ${snippet}`.toLowerCase();
    return OFFER_RELEVANCE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Parse Google SERP HTML into structured organic results.
 * @param {string} html
 * @param {string} discoveryQuery
 * @param {number} maxResults
 * @param {number} [rankOffset=0] Global rank offset for pagination
 */
export function parseGoogleSerpHtml(html, discoveryQuery, maxResults = 10, rankOffset = 0) {
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();

    const pushResult = (url, title, snippet) => {
        if (results.length >= maxResults) return;
        const normalized = normalizeResultUrl(url);
        if (!normalized || seen.has(normalized)) return;
        const host = getHostname(normalized);
        if (!host || isBlockedHost(host) || isBlockedPath(normalized)) return;
        const cleanTitle = normalizeSerpText(title);
        if (!cleanTitle || cleanTitle.length < 3) return;
        seen.add(normalized);
        results.push({
            url: normalized,
            title: cleanTitle,
            snippet: normalizeSerpText(snippet),
            discoveryQuery,
            discoverySource: 'google',
            serpRank: rankOffset + results.length + 1,
        });
    };

    $('#search .g, div[data-hveid] .g, .MjjYud').each((_, el) => {
        if (results.length >= maxResults) return false;
        const block = $(el);
        const linkEl = block.find('a[href]').filter((__, a) => {
            const h = $(a).attr('href') || '';
            return h.startsWith('/url?') || h.startsWith('http');
        }).first();
        const rawUrl = decodeGoogleResultUrl(linkEl.attr('href'));
        const title = linkEl.find('h3').text() || linkEl.text();
        const snippet = block.find('.VwiC3b, .st, [data-sncf]').first().text()
            || block.find('span').not('h3 span').text().slice(0, 300);
        pushResult(rawUrl, title, snippet);
    });

    if (results.length === 0) {
        $('a h3').each((_, h3) => {
            if (results.length >= maxResults) return false;
            const link = $(h3).closest('a');
            pushResult(decodeGoogleResultUrl(link.attr('href')), $(h3).text(), '');
        });
    }

    return results;
}

/**
 * Filter, dedupe, and rank SERP results for crawl seeding.
 * @param {object[]} results
 * @param {object} options
 */
export function filterDiscoveryResults(results, options = {}) {
    const {
        allowedDomains = [],
        denyPatterns = [],
        maxResults = 50,
        existingUrls = [],
    } = options;

    const seen = new Set(
        existingUrls.map((u) => normalizeResultUrl(u)?.toLowerCase()).filter(Boolean),
    );
    const filtered = [];

    const sorted = [...results].sort((a, b) => {
        const q = (a.discoveryQuery || '').localeCompare(b.discoveryQuery || '');
        if (q !== 0) return q;
        return (a.serpRank || 0) - (b.serpRank || 0);
    });

    for (const r of sorted) {
        if (filtered.length >= maxResults) break;

        const normalized = normalizeResultUrl(r.url);
        if (!normalized) continue;

        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;

        if (!isDomainAllowed(normalized, allowedDomains)) continue;
        if (isDeniedUrl(normalized, denyPatterns)) continue;
        if (!isRelevantOfferResult(normalized, r.title, r.snippet)) continue;

        seen.add(key);
        filtered.push({
            ...r,
            url: normalized,
            title: normalizeSerpText(r.title),
            snippet: normalizeSerpText(r.snippet),
        });
    }

    return filtered;
}

/**
 * Infer sourceType hint from discovered URL for parser routing.
 * @param {string} url
 * @returns {string|null}
 */
export function inferSourceTypeFromUrl(url) {
    const lower = url.toLowerCase();
    // Banks
    if (/emiratesnbd\.com/.test(lower))                            return 'emiratesNbd';
    if (/bankfab\.com/.test(lower))                                return 'fab';
    if (/adcb\.com/.test(lower))                                   return 'adcb';
    if (/mashreq\.com/.test(lower))                                return 'mashreq';
    if (/rakbank\.ae/.test(lower))                                 return 'rakBank';
    if (/\bdib\.ae\b/.test(lower))                                 return 'dib';
    if (/hsbc\.ae/.test(lower))                                    return 'hsbc';
    if (/citibank\.ae/.test(lower))                                return 'citibank';
    if (/\bcbd\.ae\b/.test(lower))                                 return 'cbd';
    // Card networks
    if (/visamiddleeast\.com|visa\.co\.ae|visa\.com\/.*(?:uae|ae|en_ae)/i.test(lower)) return 'visaUAE';
    if (/mastercard\.(ae|com)/.test(lower))                        return 'mastercard';
    // Coupon aggregators — specific hosts first, then generic patterns
    if (/groupon\.ae/.test(lower))                                 return 'groupon';
    if (/cuponation\.ae/.test(lower))                              return 'cuponation';
    if (/picodi\.com.*\/ae/.test(lower))                           return 'picodi';
    if (/coupons\.ae/.test(lower))                                 return 'couponsAe';
    if (/wethrift\.com/.test(lower))                               return 'wethrift';
    // Loyalty / deal platforms
    if (/smiles\.ae/.test(lower))                                  return 'smiles';
    if (/noon\.com/.test(lower))                                   return 'noon';
    // Generic coupon catch-all
    if (/(?:coupon|voucher|promocode)/.test(lower))                return 'couponFeed';
    // Generic offer/deal pages
    if (/\/(?:promo|offer|deal|bank-offer)/.test(lower))           return 'merchant';
    return null;
}

/**
 * Collect normalized URLs already present in startUrls to avoid duplicate seeds.
 * @param {Array<string|object>} startUrls
 */
export function extractExistingUrls(startUrls = []) {
    return startUrls
        .map((req) => (typeof req === 'string' ? req : req.url))
        .filter(Boolean);
}
