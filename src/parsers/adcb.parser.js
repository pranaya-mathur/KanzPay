/**
 * ADCB dedicated parser — filters nav/TouchPoints noise, tags loyalty burns.
 */
import { cleanText } from '../utils/normalize.js';
import {
    isAdcbNavNoise, isTouchpointsBurnOffer, isCategoryHeaderTitle,
} from '../validation/quality-rules.js';
import {
    BANK_META, CARD_SELECTORS, TITLE_SELECTORS, MERCHANT_SELECTORS, DESCRIPTION_SELECTORS,
    buildStandardBankOffer, isListingPage, hasOfferSignal, inferMerchantFromTitle,
    safeResolve, safePathname, wrapParserResult,
} from './bank-parser-base.js';

const PARSER = 'adcbParser';
const bankMeta = BANK_META.adcb;

export function matchAdcb(url) {
    return /adcb\.com/i.test(url);
}

export function parseAdcb($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=adcb.com; path=${safePathname(url)}`;
    const warnings = [];
    const offers = [];
    const listing = isListingPage(url, $);

    if (listing && $) {
        const seen = new Set();
        $(CARD_SELECTORS).each((_, el) => {
            const card = $(el);
            const cardText = cleanText(card.text());
            const title = cleanText(card.find(TITLE_SELECTORS).first().text()) || cardText.split('\n')[0];
            if (!title || title.length < 4 || isCategoryHeaderTitle(title, 'adcb')) return;
            if (isAdcbNavNoise(`${title} ${cardText}`)) {
                warnings.push(`adcb_nav_skipped:${title.slice(0, 30)}`);
                return;
            }
            if (!hasOfferSignal(cardText, title)) return;

            const href = card.find('a[href]').first().attr('href');
            const absUrl = href ? safeResolve(href, url) : url;
            const key = `${absUrl}::${title}`;
            if (seen.has(key)) return;
            seen.add(key);

            const merchant = extractAdcbMerchant(title, card.find(MERCHANT_SELECTORS).text());
            const extra = isTouchpointsBurnOffer(`${title} ${cardText}`) ? ['touchpoints_burn'] : ['merchant_discount'];
            offers.push(buildStandardBankOffer({
                url: absUrl, title, merchant,
                description: cleanText(card.find(DESCRIPTION_SELECTORS).first().text()),
                rawText: cardText || rawText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=listing`, extraCategories: extra,
            }));
        });

        if (offers.length === 0) {
            $('a[href*="offer"], a[href*="promo"]').each((_, el) => {
                const link = $(el);
                const title = cleanText(link.find('h2, h3').text()) || cleanText(link.text());
                if (!title || title.length < 5 || isAdcbNavNoise(title)) return;
                if (!hasOfferSignal(title, title)) return;
                const absUrl = safeResolve(link.attr('href'), url);
                if (!absUrl || seen.has(absUrl)) return;
                seen.add(absUrl);
                const merchant = extractAdcbMerchant(title, '');
                offers.push(buildStandardBankOffer({
                    url: absUrl, title, merchant, description: '',
                    rawText: title, meta, bankMeta, parserName: PARSER,
                    reason: `${reason}; mode=link-fallback`,
                    extraCategories: isTouchpointsBurnOffer(title) ? ['touchpoints_burn'] : ['merchant_discount'],
                }));
            });
        }
    }

    if (offers.length === 0 && $) {
        const title = cleanText($('h1').first().text()) || cleanText($('title').text());
        const description = cleanText($('.offer-description, article, main').text());
        if (title && !isAdcbNavNoise(`${title} ${description}`) && hasOfferSignal(`${title} ${description}`, title)) {
            offers.push(buildStandardBankOffer({
                url, title,
                merchant: extractAdcbMerchant(title, $(MERCHANT_SELECTORS).first().text()),
                description, rawText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=detail`,
                extraCategories: isTouchpointsBurnOffer(`${title} ${description}`) ? ['touchpoints_burn'] : ['merchant_discount'],
            }));
        }
    }

    return wrapParserResult(offers, warnings, PARSER);
}

function extractAdcbMerchant(title, merchantEl) {
    const fromEl = cleanText(merchantEl);
    if (fromEl && !isAdcbNavNoise(fromEl)) return fromEl;
    const by = inferMerchantFromTitle(title);
    if (by) return by;
    const m = title.match(/^By\s+(.+?)(?:\s*[-–]|$)/i);
    return m ? cleanText(m[1]) : inferMerchantFromTitle(title);
}
