/**
 * @file bank-offer.parser.js
 * Generic UAE bank / card-network offer page parser.
 *
 * Handles ADCB, Mashreq, RAK Bank, DIB, HSBC UAE, Citibank UAE, CBD, and
 * Mastercard UAE — all share a broadly similar DOM pattern:
 *   - A listing page with offer cards (title, merchant, badge/label, link)
 *   - Detail pages with a single offer headline + description + terms
 *
 * The parser infers bankName from the URL so no per-bank fork is needed.
 */

import { createDefaultOffer, isValidCouponCode } from '../schema/offerSchema.js';
import {
    extractMatch, PATTERNS, detectCategories, detectDiscountType, extractPaymentMethods,
} from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';
import { PARSER_VERSION } from '../sources/source-registry.js';
import { isCategoryHeaderTitle } from '../validation/quality-rules.js';

// ─── Domain → bank metadata ───────────────────────────────────────────────────

const BANK_META = {
    'adcb.com':       { bankName: 'ADCB',          sourceType: 'adcb' },
    'mashreq.com':    { bankName: 'Mashreq',        sourceType: 'mashreq' },
    'rakbank.ae':     { bankName: 'RAK Bank',       sourceType: 'rakBank' },
    'dib.ae':         { bankName: 'Dubai Islamic Bank', sourceType: 'dib' },
    'hsbc.ae':        { bankName: 'HSBC',           sourceType: 'hsbc' },
    'citibank.ae':    { bankName: 'Citibank',       sourceType: 'citibank' },
    'cbd.ae':         { bankName: 'CBD',            sourceType: 'cbd' },
    'mastercard.ae':  { bankName: null,             sourceType: 'mastercard', cardName: 'Mastercard' },
    'mastercard.com': { bankName: null,             sourceType: 'mastercard', cardName: 'Mastercard' },
    'adib.ae':        { bankName: 'ADIB',           sourceType: 'adib' },
    'sc.com':         { bankName: 'Standard Chartered', sourceType: 'scb' },
};

function getBankMeta(url) {
    try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        for (const [domain, meta] of Object.entries(BANK_META)) {
            if (host === domain || host.endsWith(`.${domain}`)) return meta;
        }
    } catch { /* ignore */ }
    return { bankName: null, sourceType: 'generic' };
}

// ─── Match functions (one per sourceType, all pointing here) ─────────────────

export function matchAdcb(url)      { return /adcb\.com/i.test(url); }
export function matchMashreq(url)   { return /mashreq\.com/i.test(url); }
export function matchRakBank(url)   { return /rakbank\.ae/i.test(url); }
export function matchDib(url)       { return /\bdib\.ae\b/i.test(url); }
export function matchHsbc(url)      { return /hsbc\.ae/i.test(url); }
export function matchCitibank(url)  { return /citibank\.ae/i.test(url); }
export function matchCbd(url)       { return /\bcbd\.ae\b/i.test(url); }
export function matchMastercard(url){ return /mastercard\.(ae|com).*(?:promot|offer|perk)/i.test(url); }
export function matchAdib(url)       { return /adib\.ae/i.test(url); }
export function matchScb(url)        { return /sc\.com.*\/ae\//i.test(url); }

// ─── Common listing-card selectors across UAE bank sites ─────────────────────

const CARD_SELECTORS = [
    '.offer-card', '.promo-card', '.deal-card', '.promotion-item',
    '.card-offer', 'article.offer', 'li.offer', 'li.deal',
    '[class*="offer-item"]', '[class*="promo-item"]',
    '.offer', '.promotion', '.deal',
].join(', ');

const TITLE_SELECTORS = [
    'h1', 'h2', 'h3', '.offer-title', '.promo-title', '.card-title',
    '.deal-title', '[class*="title"]',
].join(', ');

const MERCHANT_SELECTORS = [
    '.merchant-name', '.brand-name', '.store-name', '.partner-name',
    '[class*="merchant"]', '[class*="brand"]',
].join(', ');

const DESCRIPTION_SELECTORS = [
    '.offer-description', '.promo-description', '.deal-desc',
    '.offer-body', '.terms', 'p',
].join(', ');

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Entry point — called by the parser router for all bank sourceTypes.
 */
export function parseBankOffer($, url, rawText, rawHtml, meta = {}) {
    const bankMeta = getBankMeta(url);
    const reason = `bank-offer; bank=${bankMeta.bankName || bankMeta.sourceType}; path=${safePathname(url)}`;
    const warnings = [];
    const offers = [];

    const isListing = isListingPage(url, $);

    // ── Listing page: scrape offer cards ─────────────────────────────────────
    if (isListing && $) {
        const seen = new Set();

        $(CARD_SELECTORS).each((_, el) => {
            const card = $(el);
            const cardText = cleanText(card.text());

            const title = cleanText(card.find(TITLE_SELECTORS).first().text())
                || cardText.split('\n')[0].trim();

            if (!title || title.length < 4) return;
            if (isCategoryHeaderTitle(title)) {
                warnings.push(`category_header_skipped:${title.slice(0, 40)}`);
                return;
            }
            if (!hasOfferSignal(cardText, title)) return;

            const link = card.find('a[href]').first();
            const href = link.attr('href');
            const absUrl = href
                ? (href.startsWith('http') ? href : safeResolve(href, url))
                : url;

            const key = `${absUrl}::${title}`;
            if (seen.has(key)) return;
            seen.add(key);

            const merchant = cleanText(card.find(MERCHANT_SELECTORS).text())
                || inferMerchant(title);
            const description = cleanText(card.find(DESCRIPTION_SELECTORS).first().text());

            offers.push(buildBankOffer({
                url: absUrl,
                title,
                merchant,
                description,
                rawText: cardText || rawText,
                meta,
                bankMeta,
                reason: `${reason}; mode=listing-card`,
            }));
        });

        // Fallback: scrape heading+link pairs if no cards matched
        if (offers.length === 0) {
            $('a[href]').each((_, el) => {
                const link = $(el);
                const title = cleanText(link.find('h2, h3').text()) || cleanText(link.text());
                if (!title || title.length < 5 || !hasOfferSignal(title, title)) return;
                if (isCategoryHeaderTitle(title)) return;
                const absUrl = safeResolve(link.attr('href'), url);
                if (!absUrl) return;

                offers.push(buildBankOffer({
                    url: absUrl, title, merchant: inferMerchant(title),
                    description: '', rawText, meta, bankMeta,
                    reason: `${reason}; mode=link-fallback`,
                }));
            });
        }
    }

    // ── Detail page: single offer ─────────────────────────────────────────────
    if (offers.length === 0 && $) {
        const title = cleanText($('h1').first().text())
            || cleanText($('meta[property="og:title"]').attr('content'))
            || cleanText($('title').text());
        const description = cleanText($('.offer-description, .promo-description, article, main').text())
            || cleanText($('p').map((_, p) => $(p).text()).get().join(' ').slice(0, 2000));
        const merchant = cleanText($(MERCHANT_SELECTORS).first().text())
            || cleanText($('meta[property="og:site_name"]').attr('content'))
            || inferMerchant(title);

        if (title && title.length > 4 && !isCategoryHeaderTitle(title) && hasOfferSignal(`${title} ${description}`, title)) {
            offers.push(buildBankOffer({
                url, title, merchant, description, rawText, meta, bankMeta,
                reason: `${reason}; mode=detail`,
            }));
        }
    }

    if (offers.length === 0) {
        warnings.push('no_offer:no_cards_found');
    }

    return { offers, warnings };
}

// ─── Offer builder ────────────────────────────────────────────────────────────

function buildBankOffer({ url, title, merchant, description, rawText, meta, bankMeta, reason }) {
    const offer = createDefaultOffer({
        sourceUrl: url,
        sourceType: bankMeta.sourceType,
        parserName: 'bankOfferParser',
        parserVersion: PARSER_VERSION,
        parserReason: reason,
        crawlDepth: meta.crawlDepth ?? 0,
    });

    const combined = `${title} ${description} ${rawText}`;
    const { discountType, discountValue } = detectDiscountType(combined);

    offer.bankName = bankMeta.bankName || null;
    offer.cardName = bankMeta.cardName || inferCardName(combined);
    offer.merchantName = merchant || null;
    offer.offerTitle = title;
    offer.offerDescription = description || null;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.currency = 'AED';
    offer.minSpend = toNum(extractMatch(combined, PATTERNS.minSpend));
    offer.capValue = toNum(extractMatch(combined, PATTERNS.cap));
    offer.validFrom = extractMatch(combined, PATTERNS.validity);
    offer.validTo = extractMatch(combined, PATTERNS.validityShort)
        || extractMatch(combined, PATTERNS.validity);
    offer.couponCode = sanitizeCode(extractMatch(combined, PATTERNS.couponCode));
    offer.paymentMethods = extractPaymentMethods(combined);
    offer.categories = detectCategories(combined);
    offer.stackable = /not combinable|cannot be combined|not.*stack/i.test(combined) ? false
        : /can be combined|stackable/i.test(combined) ? true : false;
    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, rawText);
    offer.rawText = rawText;

    return offer;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isListingPage(url, $) {
    if (/\/offers?\/?$|\/promotions?\/?$|\/deals?\/?$|\/rewards?\/?$|\/perks?\/?$/i.test(url)) return true;
    if ($) {
        const cardCount = $(CARD_SELECTORS).length;
        if (cardCount >= 2) return true;
    }
    return false;
}

function hasOfferSignal(text, title) {
    const combined = `${title} ${text}`;
    return /cashback|%\s*off|AED\s*\d|\d+\s*%|promo\s*code|valid\s+until|minimum\s+spend|discount|coupon|save|reward/i.test(combined);
}

function inferMerchant(title) {
    if (!title) return null;
    const m = title.match(/(?:at|with|from|for)\s+([A-Za-z0-9&'.\s-]{2,40})/i);
    return m ? cleanText(m[1]) : null;
}

function inferCardName(text) {
    if (/visa\s+infinite/i.test(text)) return 'Visa Infinite';
    if (/visa\s+signature/i.test(text)) return 'Visa Signature';
    if (/visa\s+platinum/i.test(text)) return 'Visa Platinum';
    if (/\bvisa\b/i.test(text)) return 'Visa';
    if (/world\s+elite/i.test(text)) return 'World Elite Mastercard';
    if (/mastercard/i.test(text)) return 'Mastercard';
    return null;
}

function sanitizeCode(code) {
    if (!code) return null;
    const c = cleanText(code).toUpperCase();
    return isValidCouponCode(c) ? c : null;
}

function toNum(v) {
    if (!v) return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

function safePathname(url) {
    try { return new URL(url).pathname; } catch { return url; }
}

function safeResolve(href, base) {
    if (!href) return null;
    if (href.startsWith('http')) return href;
    try { return new URL(href, base).href; } catch { return null; }
}
