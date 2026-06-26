/**
 * RAK Bank offers parser.
 */
import { cleanText } from '../utils/normalize.js';
import { isCategoryHeaderTitle } from '../validation/quality-rules.js';
import {
    BANK_META, CARD_SELECTORS, TITLE_SELECTORS, MERCHANT_SELECTORS, DESCRIPTION_SELECTORS,
    buildStandardBankOffer, isListingPage, hasOfferSignal, inferMerchantFromTitle,
    safeResolve, safePathname, wrapParserResult,
} from './bank-parser-base.js';

const PARSER = 'rakbankParser';
const bankMeta = BANK_META.rakBank;

export function matchRakBank(url) {
    return /rakbank\.ae/i.test(url);
}

export function parseRakBank($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=rakbank.ae; path=${safePathname(url)}`;
    const offers = [];
    const listing = isListingPage(url, $);

    if (listing && $) {
        const seen = new Set();
        $(CARD_SELECTORS).each((_, el) => {
            const card = $(el);
            const cardText = cleanText(card.text());
            const title = cleanText(card.find(TITLE_SELECTORS).first().text()) || cardText.split('\n')[0];
            if (!title || isCategoryHeaderTitle(title)) return;
            if (!hasOfferSignal(cardText, title)) return;
            const absUrl = safeResolve(card.find('a[href]').first().attr('href'), url) || url;
            const key = `${absUrl}::${title}`;
            if (seen.has(key)) return;
            seen.add(key);
            offers.push(buildStandardBankOffer({
                url: absUrl, title,
                merchant: cleanText(card.find(MERCHANT_SELECTORS).text()) || inferMerchantFromTitle(title),
                description: cleanText(card.find(DESCRIPTION_SELECTORS).first().text()),
                rawText: cardText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=listing`,
                extraCategories: ['merchant_discount'],
            }));
        });
    }

    if (offers.length === 0 && $) {
        const title = cleanText($('h1').first().text());
        const description = cleanText($('article, main, .wpsPortal').text());
        if (title && hasOfferSignal(`${title} ${description}`, title)) {
            offers.push(buildStandardBankOffer({
                url, title, merchant: inferMerchantFromTitle(title),
                description, rawText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=detail`,
                extraCategories: ['merchant_discount'],
            }));
        }
    }

    return wrapParserResult(offers, [], PARSER);
}
