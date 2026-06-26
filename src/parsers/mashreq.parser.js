/**
 * Mashreq Neo offers parser — GraphQL API + listing cards + detail/card pages.
 */
import { cleanText } from '../utils/normalize.js';
import { isCategoryHeaderTitle, isMashreqVantageNoise } from '../validation/quality-rules.js';
import { parseMashreqApiPayload } from './mashreq-api.parser.js';
import {
    BANK_META, buildStandardBankOffer, hasOfferSignal, inferMerchantFromTitle,
    safeResolve, safePathname, wrapParserResult,
} from './bank-parser-base.js';

const PARSER = 'mashreqParser';
const bankMeta = BANK_META.mashreq;

export function matchMashreq(url) {
    return /mashreq\.com/i.test(url);
}

export function parseMashreq($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=mashreq.com; path=${safePathname(url)}`;
    const warnings = [];
    const offers = [];
    const seen = new Set();
    const isListing = /\/neo\/offers\/?$/i.test(url) || /\/neo\/offers\/?\?/i.test(url);
    const isOfferDetail = /\/neo\/offers\/[^/]+\/?$/i.test(url) && !isListing;
    const isCardPage = /\/cards\/(?:credit|debit)-cards\/[^/]+/i.test(url);

    if (meta.mashreqApiPayload && isListing) {
        for (const offer of parseMashreqApiPayload(meta.mashreqApiPayload, url, meta)) {
            const key = `${offer.offerTitle}::${offer.merchantName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            offers.push(offer);
        }
    }

    if ($ && isListing && offers.length === 0) {
        parseMashreqOfferCards($, url, rawText, meta, reason, offers, seen, warnings);
        parseMashreqOfferLinks($, url, rawText, meta, reason, offers, seen, warnings);
    }

    if ($ && isOfferDetail) {
        parseMashreqDetailPage($, url, rawText, meta, reason, offers, seen);
    }

    if ($ && isCardPage) {
        parseMashreqCardBenefits($, url, rawText, meta, reason, offers, seen);
    }

    if (offers.length === 0 && $) {
        const title = cleanText($('h1').first().text()) || cleanText($('title').text());
        const description = cleanText($('article, main, .content').text()) || cleanText($('p').text());
        if (title && title.length > 4 && !isCategoryHeaderTitle(title) && !isMashreqVantageNoise(`${title} ${description}`)
            && hasOfferSignal(`${title} ${description}`, title)) {
            const key = `${title}::fallback`;
            if (!seen.has(key)) {
                seen.add(key);
                offers.push(buildStandardBankOffer({
                    url, title,
                    merchant: inferMerchantFromTitle(title) || inferMerchantFromTitle(description),
                    description, rawText, meta, bankMeta, parserName: PARSER,
                    reason: `${reason}; mode=fallback-detail`,
                    extraCategories: ['merchant_discount'],
                }));
            }
        }
    }

    if (offers.length === 0) warnings.push('no_offer:mashreq_empty');

    return wrapParserResult(offers, warnings, PARSER);
}

function parseMashreqOfferCards($, url, rawText, meta, reason, offers, seen, warnings) {
    $('.ui-card, [class*="offer"], article').each((_, el) => {
        const card = $(el);
        const cardText = cleanText(card.text());
        const title = cleanText(card.find('h2, h3, h4, h5, h6, .title').first().text())
            || cardText.split('\n')[0];
        if (!title || title.length < 5 || /^know more$/i.test(title)) return;
        if (isCategoryHeaderTitle(title, 'mashreq')) return;
        if (isMashreqVantageNoise(cardText)) return;
        if (!hasOfferSignal(cardText, title)) return;

        let merchant = inferMerchantFromTitle(title) || inferMerchantFromTitle(cardText);
        if (!merchant || /vantage points|know more/i.test(merchant)) {
            merchant = title;
        }

        const href = card.find('a[href]').first().attr('href');
        const absUrl = safeResolve(href, url) || url;
        const dedupeKey = `${title}::${absUrl}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        offers.push(buildStandardBankOffer({
            url: absUrl, title,
            merchant,
            description: cleanText(card.find('p').first().text()),
            rawText: cardText || rawText,
            meta, bankMeta, parserName: PARSER,
            reason: `${reason}; mode=listing-card`,
            extraCategories: ['merchant_discount'],
        }));
    });
}

function parseMashreqOfferLinks($, url, rawText, meta, reason, offers, seen, warnings) {
    $('a[href*="/neo/offers/"], a[href*="/offers/"]').each((_, el) => {
        const href = $(el).attr('href');
        const absUrl = safeResolve(href, url);
        if (!absUrl || seen.has(absUrl)) return;
        if (absUrl.replace(/\/$/, '') === url.replace(/\/$/, '')) return;
        if (shouldSkipMashreqUrl(absUrl)) {
            warnings.push(`guid_url_skipped:${absUrl.slice(-40)}`);
            return;
        }
        if (!/\/neo\/offers\/[^/]+/i.test(absUrl)) return;

        const title = cleanText($(el).find('h2, h3, h4, h5, h6, .title').first().text())
            || cleanText($(el).text());
        if (!title || title.length < 5 || /^know more$/i.test(title)) return;
        if (isCategoryHeaderTitle(title, 'mashreq')) return;
        if (isMashreqVantageNoise(title)) return;
        if (!hasOfferSignal(title, title)) return;

        seen.add(absUrl);
        offers.push(buildStandardBankOffer({
            url: absUrl, title,
            merchant: inferMerchantFromTitle(title) || title.split(/\s+/).slice(0, 3).join(' '),
            description: cleanText($(el).find('p').text()),
            rawText: cleanText($(el).text()) || rawText,
            meta, bankMeta, parserName: PARSER,
            reason: `${reason}; mode=listing-link`,
            extraCategories: ['merchant_discount'],
        }));
    });
}

function parseMashreqDetailPage($, url, rawText, meta, reason, offers, seen) {
    const title = cleanText($('h1').first().text()) || cleanText($('title').text());
    const description = cleanText($('article, main, .content').text()) || cleanText($('p').text());
    const combined = `${title} ${description} ${rawText}`;

    if (/\/early-bird-cashback/i.test(url)) {
        parseMashreqCashbackTiers(combined, url, title, meta, reason, offers, seen);
    }

    if (title && title.length > 4 && !isCategoryHeaderTitle(title) && !isMashreqVantageNoise(combined)
        && hasOfferSignal(combined, title)) {
        const key = `${title}::detail`;
        if (!seen.has(key)) {
            seen.add(key);
            offers.push(buildStandardBankOffer({
                url, title,
                merchant: inferMerchantFromTitle(title) || inferMerchantFromTitle(description) || title,
                description, rawText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=detail`,
                extraCategories: ['merchant_discount'],
            }));
        }
    }
}

function parseMashreqCashbackTiers(text, url, pageTitle, meta, reason, offers, seen) {
    const tierPattern = /(?:up\s+to\s+)?AED\s*([\d,]+)\s*(?:cash[\s-]*back)?/gi;
    let match;
    while ((match = tierPattern.exec(text)) !== null) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (!Number.isFinite(amount) || amount <= 1) continue;
        const title = `${pageTitle} — AED ${amount.toLocaleString()} cashback`;
        const key = `${title}::tier`;
        if (seen.has(key)) continue;
        seen.add(key);
        offers.push(buildStandardBankOffer({
            url, title,
            merchant: 'Mashreq',
            description: match[0],
            rawText: text,
            meta, bankMeta, parserName: PARSER,
            reason: `${reason}; mode=early-bird-tier`,
            extraCategories: ['merchant_discount', 'cashback'],
        }));
    }
}

function parseMashreqCardBenefits($, url, rawText, meta, reason, offers, seen) {
    const cardName = cleanText($('h1').first().text()) || 'Mashreq Card';
    const snippets = [];

    $('li, p, h3, h4').each((_, el) => {
        const t = cleanText($(el).text());
        if (t.length >= 12 && t.length <= 300 && /(\d{1,2})\s*%|AED\s*[\d,]+|cash[\s-]*back/i.test(t)) {
            snippets.push(t);
        }
    });

    for (const snippet of snippets) {
        if (isMashreqVantageNoise(snippet)) continue;

        const multiMerchant = snippet.match(
            /(\d{1,2})\s*%\s*(?:cash[\s-]*back\s+)?at\s+([^.]+?)(?:\s+and\s+up\s+to|\s+and\s+|\.\s|$)/i,
        );
        if (multiMerchant) {
            const pct = multiMerchant[1];
            const merchants = multiMerchant[2].split(/,\s*|,\s*and\s+|\s+and\s+/i)
                .map((m) => cleanText(m))
                .filter((m) => m.length >= 2 && m.length <= 40);
            for (const merchant of merchants) {
                const title = `${pct}% cashback at ${merchant}`;
                const key = `${title}::${cardName}`;
                if (seen.has(key)) continue;
                seen.add(key);
                offers.push(buildStandardBankOffer({
                    url, title,
                    merchant,
                    description: snippet,
                    rawText: snippet,
                    meta, bankMeta, parserName: PARSER,
                    reason: `${reason}; mode=card-benefit`,
                    extraCategories: ['merchant_discount', 'cashback'],
                }));
            }
            continue;
        }

        const pctOff = snippet.match(/(\d{1,2})\s*%\s*(?:off|discount)/i);
        if (pctOff) {
            const merchant = inferMerchantFromTitle(snippet) || inferMerchantFromTitle(cardName);
            const title = snippet.length <= 120 ? snippet : `${pctOff[1]}% off — ${cardName}`;
            const key = `${title}::${cardName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            offers.push(buildStandardBankOffer({
                url, title,
                merchant: merchant || cardName,
                description: snippet,
                rawText: snippet,
                meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=card-percent`,
                extraCategories: ['merchant_discount'],
            }));
        }
    }
}

function shouldSkipMashreqUrl(absUrl) {
    try {
        const u = new URL(absUrl);
        const isListingRoot = /\/neo\/offers\/?$/i.test(u.pathname);
        if (isListingRoot && /guid=|itemid=|uuid=/i.test(u.search)) return true;
        if (u.pathname.length > 160) return true;
    } catch { /* ignore */ }
    return false;
}
