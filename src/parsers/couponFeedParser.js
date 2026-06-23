/**
 * @file couponFeedParser.js
 * UAE coupon directories, affiliate feeds, deal aggregators, and merchant promo pages with codes.
 */

import { createDefaultOffer, isValidCouponCode } from '../schema/offerSchema.js';
import { extractMatch, PATTERNS, detectDiscountType } from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';
import { extractJsonLd, offersFromJsonLd } from '../extraction/structured-data-extractor.js';

/** Domains/paths that indicate coupon feeds — NOT bank "deals" pages. */
const COUPON_DOMAIN_RE = /(?:coupon|cuponation|groupon|picodi|wethrift|voucher|promocode|discountcode|rebates?|cashbackportal|smiles|noon)/i;
const COUPON_PATH_RE = /\/(?:coupons?|promo-?codes?|vouchers?|deals?\/[^/]+|offers?\/[^/]+)/i;

/** Per-site card selectors for known UAE coupon aggregators. */
const SITE_CARD_SELECTORS = {
    'groupon.ae': '.deal, [class*="deal-card"], [data-testid*="deal"], article',
    'cuponation.ae': '.coupon, .deal, [class*="coupon"], [class*="offer"]',
    'picodi.com': '.coupon, [class*="coupon-item"], [class*="offer-card"], .promo',
    'coupons.ae': '.coupon-item, .coupon, .deal, [class*="coupon"]',
    'wethrift.com': '.coupon, .deal, [class*="coupon"], article',
    'smiles.ae': '.offer, .deal, [class*="offer"], article',
    'noon.com': '[class*="offer"], [class*="deal"], .coupon, article',
};

const DEFAULT_CARD_SELECTOR = '.coupon, .deal, .offer-item, .coupon-item, [class*="coupon"], [data-coupon-code]';

/**
 * @param {string} url
 * @returns {boolean}
 */
export function matchCouponFeed(url) {
    const lower = url.toLowerCase();
    if (/emiratesnbd|bankfab|visa\.co\.ae|visa\.com/i.test(lower)) return false;
    try {
        const { hostname, pathname } = new URL(url);
        if (COUPON_DOMAIN_RE.test(hostname)) return true;
        if (COUPON_PATH_RE.test(pathname) && !/\/cards?\//i.test(pathname)) return true;
    } catch { /* invalid URL */ }
    return false;
}

function cardSelectorForUrl(url) {
    try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        for (const [domain, sel] of Object.entries(SITE_CARD_SELECTORS)) {
            if (host === domain || host.endsWith(`.${domain}`)) return sel;
        }
    } catch { /* ignore */ }
    return DEFAULT_CARD_SELECTOR;
}

/**
 * @param {import('cheerio').CheerioAPI|null} $
 * @param {string} url
 * @param {string} rawText
 * @param {string} rawHtml
 * @param {object} meta
 * @returns {object[]}
 */
export function parseCouponFeed($, url, rawText, rawHtml, meta = {}) {
    const reason = `coupon-feed; host=${new URL(url).hostname}`;
    const offers = [];
    const seenCodes = new Set();

    if ($) {
        const jsonLdOffers = offersFromJsonLd(extractJsonLd($));
        for (const j of jsonLdOffers) {
            const built = buildCouponOffer({
                url,
                title: j.offerTitle,
                merchant: j.merchantName,
                code: null,
                description: j.offerDescription,
                rawText,
                meta,
                reason: `${reason}; mode=json-ld`,
                networkSource: new URL(url).hostname,
            });
            if (built.offerTitle) offers.push(built);
        }

        const selector = cardSelectorForUrl(url);
        $(selector).each((_, el) => {
            const item = $(el);
            const title = cleanText(item.find('h2, h3, h4, .title, .deal-title, [class*="title"]').first().text())
                || cleanText(item.find('a').first().text());
            const merchant = cleanText(item.find('.store-name, .merchant, .brand, [class*="store"], [class*="merchant"]').text());
            const rawCode = cleanText(
                item.find('.coupon-code, .code, [data-code], [data-coupon-code], [class*="code"]').first().text()
                || item.attr('data-coupon-code')
                || item.find('[data-code]').attr('data-code'),
            );
            const code = sanitizeCouponCode(rawCode)
                || sanitizeCouponCode(extractMatch(item.text(), PATTERNS.couponCode));
            const link = item.find('a[href]').first().attr('href');
            if (!title || title.length < 4) return;
            if (code && seenCodes.has(code)) return;
            if (code) seenCodes.add(code);

            const absUrl = link ? (link.startsWith('http') ? link : new URL(link, url).href) : url;
            offers.push(buildCouponOffer({
                url: absUrl, title, merchant, code,
                description: cleanText(item.find('p, .desc, [class*="desc"]').text()),
                rawText: cleanText(item.text()), meta,
                reason: `${reason}; mode=feed-item`,
                networkSource: new URL(url).hostname,
            }));
        });
    }

    if (offers.length === 0) {
        const title = cleanText($?.('h1').text()) || cleanText($?.('title').text());
        const merchant = cleanText($?.('.store-name, .merchant-name, [class*="merchant"]').text());
        const code = sanitizeCouponCode(extractMatch(rawText, PATTERNS.couponCode))
            || sanitizeCouponCode(cleanText($?.('.coupon-code, .promo-code, [class*="coupon-code"]').text()));

        if (title && (code || /%\s*off|discount/i.test(rawText))) {
            offers.push(buildCouponOffer({
                url, title, merchant, code,
                description: cleanText($?.('p').text()), rawText, meta,
                reason: `${reason}; mode=single`,
                networkSource: new URL(url).hostname,
            }));
        }
    }

    return offers.filter((o) => o.offerTitle || isValidCouponCode(o.couponCode));
}

function sanitizeCouponCode(code) {
    if (!code) return null;
    const c = cleanText(code).toUpperCase().replace(/^CODE[:\s]*/i, '');
    return isValidCouponCode(c) ? c : null;
}

function buildCouponOffer({ url, title, merchant, code, description, rawText, meta, reason, networkSource }) {
    const offer = createDefaultOffer({
        sourceUrl: url,
        sourceType: 'couponFeed',
        parserName: 'couponFeedParser',
        parserReason: reason,
        crawlDepth: meta.crawlDepth,
    });

    const { discountType, discountValue } = detectDiscountType(`${title} ${description} ${rawText}`);

    offer.merchantName = merchant || extractMatch(title, /(?:for|at)\s+([A-Za-z0-9&'\s.-]{2,40})/i);
    offer.offerTitle = title;
    offer.offerDescription = description;
    offer.discountType = code ? 'coupon' : discountType;
    offer.discountValue = discountValue;
    offer.couponCode = code;
    offer.validTo = extractMatch(rawText, PATTERNS.validity);
    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, rawText);
    offer.rawText = rawText;
    return offer;
}
