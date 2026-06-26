/**
 * @file index.js
 * Parser router — source-specific parsers first, generic fallback last.
 */

import { matchEnbd, parseEnbd } from './enbd.parser.js';
import { matchVisa, parseVisa } from './visa.parser.js';
import { matchFab, parseFab } from './fab.parser.js';
import { matchAdcb, parseAdcb } from './adcb.parser.js';
import { matchMashreq, parseMashreq } from './mashreq.parser.js';
import { matchDib, parseDib } from './dib.parser.js';
import { matchAdib, parseAdib } from './adib.parser.js';
import { matchRakBank, parseRakBank } from './rakbank.parser.js';
import { matchHsbc, parseHsbc } from './hsbc.parser.js';
import { matchCbd, parseCbd } from './cbd.parser.js';
import { matchCouponFeed, parseCouponFeed } from './couponFeedParser.js';
import { matchMerchant, parseMerchant } from './merchantParser.js';
import { parseGenericOffer } from './generic-offer.parser.js';
import {
    parseBankOffer,
    matchCitibank, matchMastercard, matchScb,
} from './bank-offer.parser.js';

/**
 * Order matters — first match wins. Generic is never in this list.
 */
const PARSER_REGISTRY = [
    { id: 'emiratesNbd', match: matchEnbd,        parse: wrapParser(parseEnbd) },
    { id: 'visaUAE',     match: matchVisa,        parse: wrapParser(parseVisa) },
    { id: 'fab',         match: matchFab,         parse: wrapParser(parseFab) },
    { id: 'adcb',        match: matchAdcb,        parse: wrapParser(parseAdcb) },
    { id: 'mashreq',     match: matchMashreq,     parse: wrapParser(parseMashreq) },
    { id: 'rakBank',     match: matchRakBank,     parse: wrapParser(parseRakBank) },
    { id: 'dib',         match: matchDib,         parse: wrapParser(parseDib) },
    { id: 'hsbc',        match: matchHsbc,        parse: wrapParser(parseHsbc) },
    { id: 'adib',        match: matchAdib,        parse: wrapParser(parseAdib) },
    { id: 'cbd',         match: matchCbd,         parse: wrapParser(parseCbd) },
    { id: 'citibank',    match: matchCitibank,    parse: wrapParser(parseBankOffer) },
    { id: 'mastercard',  match: matchMastercard,  parse: wrapParser(parseBankOffer) },
    { id: 'scb',         match: matchScb,         parse: wrapParser(parseBankOffer) },
    { id: 'couponFeed',  match: matchCouponFeed,  parse: wrapParser(parseCouponFeed) },
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
        adcb:        'adcbParser',
        mashreq:     'mashreqParser',
        rakBank:     'rakbankParser',
        dib:         'dibParser',
        hsbc:        'hsbcParser',
        citibank:    'bankOfferParser',
        cbd:         'cbdParser',
        mastercard:  'bankOfferParser',
        adib:        'adibParser',
        scb:         'bankOfferParser',
    };
    return map[id] || `${id}Parser`;
}

export { PARSER_REGISTRY };
