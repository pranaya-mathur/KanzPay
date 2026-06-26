/**
 * Dubai Islamic Bank parser — card offers listing + detail pages.
 */
import { cleanText, parseDate } from '../utils/normalize.js';
import { isCategoryHeaderTitle } from '../validation/quality-rules.js';
import {
    BANK_META, buildStandardBankOffer, hasOfferSignal, inferMerchantFromTitle,
    safeResolve, safePathname, wrapParserResult,
} from './bank-parser-base.js';

const PARSER = 'dibParser';
const bankMeta = BANK_META.dib;
const DIB_CARD_SELECTORS = '.card-list-item, .offer-listing-sec .card-list-item';

export function matchDib(url) {
    return /\bdib\.ae\b/i.test(url);
}

export function parseDib($, url, rawText, rawHtml, meta = {}) {
    if (/\/(?:news|media|press|blog)\//i.test(url)) {
        return wrapParserResult([], ['news_url_skipped'], PARSER);
    }

    const reason = `domain=dib.ae; path=${safePathname(url)}`;
    const offers = [];
    const seen = new Set();
    const isListing = /\/offers(?:\/card-offers)?\/?$/i.test(url) || /\/offers\/card-offers/i.test(url);
    const isDetail = /\/offers\/offer-detail\//i.test(url);

    if ($ && (isListing || $(DIB_CARD_SELECTORS).length > 0)) {
        $(DIB_CARD_SELECTORS).each((_, el) => {
            const card = $(el);
            const cardText = cleanText(card.text());
            const title = cleanText(card.find('.card-title-info a, .card-title-info').first().text())
                || cleanText(card.find('h2, h3').first().text());
            if (!title || isCategoryHeaderTitle(title)) return;
            const description = cleanText(card.find('.card-desc-info').first().text());
            const combined = `${title} ${description} ${cardText}`;
            if (!hasOfferSignal(combined, title)) return;

            const href = card.find('a[href*="/offers/offer-detail/"]').first().attr('href')
                || card.find('a[href]').first().attr('href');
            const absUrl = safeResolve(href, url) || url;
            const validTo = parseDate(card.attr('data-to'))
                || parseDate(card.find('.offer-expire').text().replace(/valid till/i, ''));
            const key = `${absUrl}::${title}`;
            if (seen.has(key)) return;
            seen.add(key);

            const offer = buildStandardBankOffer({
                url: absUrl, title,
                merchant: title || inferMerchantFromTitle(description),
                description,
                rawText: cardText,
                meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=listing`,
                extraCategories: ['merchant_discount'],
            });
            if (validTo && !offer.validTo) offer.validTo = validTo;
            offers.push(offer);
        });
    }

    if (isDetail && $ && offers.length === 0) {
        const title = cleanText($('h1').first().text()) || cleanText($('.card-title-info').first().text());
        const description = cleanText($('.card-desc-info, article, main').text());
        if (title && hasOfferSignal(`${title} ${description}`, title) && !/news|press release/i.test(title)) {
            offers.push(buildStandardBankOffer({
                url, title, merchant: title || inferMerchantFromTitle(description),
                description, rawText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=detail`,
                extraCategories: ['merchant_discount'],
            }));
        }
    }

    if (offers.length === 0 && $) {
        const title = cleanText($('h1').first().text());
        const description = cleanText($('article, main').text());
        if (title && hasOfferSignal(`${title} ${description}`, title) && !/news|press release|error/i.test(title)) {
            offers.push(buildStandardBankOffer({
                url, title, merchant: inferMerchantFromTitle(title),
                description, rawText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=fallback`,
                extraCategories: ['merchant_discount'],
            }));
        }
    }

    return wrapParserResult(offers, [], PARSER);
}
