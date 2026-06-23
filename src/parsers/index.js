/**
 * @file index.js
 * Parser router — source-specific parsers first, generic fallback last.
 */

import { matchEnbd, parseEnbd } from './enbd.parser.js';
import { matchVisa, parseVisa } from './visa.parser.js';
import { matchFab, parseFab } from './fab.parser.js';
import { matchCouponFeed, parseCouponFeed } from './couponFeedParser.js';
import { matchMerchant, parseMerchant } from './merchantParser.js';
import { parseGenericOffer } from './generic-offer.parser.js';
import {
    parseBankOffer,
    matchAdcb, matchMashreq, matchRakBank, matchDib,
    matchHsbc, matchCitibank, matchCbd, matchMastercard,
    matchAdib, matchScb,
} from './bank-offer.parser.js';

/**
 * Order matters — first match wins. Generic is never in this list.
 * Domain-specific parsers MUST come before the broad 'merchant' catch-all.
 */
const PARSER_REGISTRY = [
    // ── Specific bank parsers (domain-exact) — must beat 'merchant' ──────────
    { id: 'emiratesNbd', match: matchEnbd,        parse: wrapParser(parseEnbd) },
    { id: 'visaUAE',     match: matchVisa,        parse: wrapParser(parseVisa) },
    { id: 'fab',         match: matchFab,         parse: wrapParser(parseFab) },
    { id: 'adcb',        match: matchAdcb,        parse: wrapParser(parseBankOffer) },
    { id: 'mashreq',     match: matchMashreq,     parse: wrapParser(parseBankOffer) },
    { id: 'rakBank',     match: matchRakBank,     parse: wrapParser(parseBankOffer) },
    { id: 'dib',         match: matchDib,         parse: wrapParser(parseBankOffer) },
    { id: 'hsbc',        match: matchHsbc,        parse: wrapParser(parseBankOffer) },
    { id: 'citibank',    match: matchCitibank,    parse: wrapParser(parseBankOffer) },
    { id: 'cbd',         match: matchCbd,         parse: wrapParser(parseBankOffer) },
    { id: 'mastercard',  match: matchMastercard,  parse: wrapParser(parseBankOffer) },
    { id: 'adib',        match: matchAdib,        parse: wrapParser(parseBankOffer) },
    { id: 'scb',         match: matchScb,         parse: wrapParser(parseBankOffer) },
    // ── Coupon aggregators (domain-matched via COUPON_DOMAIN_RE) ─────────────
    { id: 'couponFeed',  match: matchCouponFeed,  parse: wrapParser(parseCouponFeed) },
    // ── Broad merchant catch-all — must be last ───────────────────────────────
    { id: 'merchant',    match: (url, hint) => matchMerchant(url, hint), parse: wrapParser(parseMerchant) },
];

function wrapParser(fn) {
    return ($, url, rawText, rawHtml, meta) => {
        const result = fn($, url, rawText, rawHtml, meta);
        return unwrapParseResult(result);
    };
}

function unwrapParseResult(result) {
    if (Array.isArray(result)) return { offers: result, extractionWarnings: [] };
    return {
        offers: result.offers || [],
        extractionWarnings: result.warnings || [],
        pageOutcome: result.pageOutcome || null,
    };
}

/**
 * Route a page to the best parser by domain/path (not broad keywords).
 * @returns {{ parserId: string, parserName: string, reason: string, offers: object[], extractionWarnings: string[] }}
 */
export function routeParser(url, $, rawText, rawHtml, meta = {}) {
    const sourceHint = meta.sourceTypeHint;

    if (sourceHint) {
        const hinted = PARSER_REGISTRY.find((p) => p.id === sourceHint);
        if (hinted) {
            const parsed = hinted.parse($, url, rawText, rawHtml, meta);
            return {
                parserId: hinted.id,
                parserName: parserNameFor(hinted.id),
                reason: `userData.sourceType=${sourceHint}`,
                ...parsed,
            };
        }
    }

    for (const entry of PARSER_REGISTRY) {
        if (entry.match(url, sourceHint)) {
            const parsed = entry.parse($, url, rawText, rawHtml, meta);
            return {
                parserId: entry.id,
                parserName: parserNameFor(entry.id),
                reason: `auto-match:${entry.id}`,
                ...parsed,
            };
        }
    }

    const generic = unwrapParseResult(parseGenericOffer($, url, rawText, rawHtml, meta));
    return {
        parserId: 'generic',
        parserName: 'genericOfferParser',
        reason: 'fallback:no-source-match',
        ...generic,
    };
}

function parserNameFor(id) {
    const map = {
        emiratesNbd: 'enbdParser',
        visaUAE:     'visaParser',
        fab:         'fabParser',
        couponFeed:  'couponFeedParser',
        merchant:    'merchantParser',
        adcb:        'bankOfferParser',
        mashreq:     'bankOfferParser',
        rakBank:     'bankOfferParser',
        dib:         'bankOfferParser',
        hsbc:        'bankOfferParser',
        citibank:    'bankOfferParser',
        cbd:         'bankOfferParser',
        mastercard:  'bankOfferParser',
        adib:        'bankOfferParser',
        scb:         'bankOfferParser',
    };
    return map[id] || `${id}Parser`;
}

export { PARSER_REGISTRY };
