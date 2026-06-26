/**
 * HSBC UAE parser — detail-first with slug-aware discount/merchant extraction.
 */
import { cleanText, parseDate } from '../utils/normalize.js';
import { detectDiscountType } from '../utils/extractPatterns.js';
import { isCategoryHeaderTitle, isEarnRateNoise, isErrorPage } from '../validation/quality-rules.js';
import {
    BANK_META, CARD_SELECTORS, TITLE_SELECTORS, MERCHANT_SELECTORS, DESCRIPTION_SELECTORS,
    buildStandardBankOffer, isListingPage, hasOfferSignal, inferMerchantFromTitle,
    safeResolve, safePathname, wrapParserResult,
} from './bank-parser-base.js';

const PARSER = 'hsbcParser';
const bankMeta = BANK_META.hsbc;

export function matchHsbc(url) {
    return /hsbc\.ae/i.test(url);
}

export function extractHsbcFromSlug(url) {
    let pathname;
    try {
        pathname = new URL(url).pathname;
    } catch {
        return {};
    }

    const slug = pathname.split('/').filter(Boolean).pop() || '';
    const hints = { categories: [] };

    if (/flexi-instalment|instalment-plans?-on-purchases/i.test(slug)) {
        hints.categories = ['instalment_plan'];
        hints.skipEmit = true;
        return hints;
    }

    const offMatch = slug.match(/-(\d{1,2})-off-/i)
        || slug.match(/-(\d{1,2})-discount/i)
        || slug.match(/-up-to-(\d{1,2})-off-/i)
        || slug.match(/-(\d{1,2})-percent-off/i)
        || slug.match(/-(\d{1,2})-discount-on/i)
        || slug.match(/save-with-a-(\d{1,2})-discount/i);
    if (offMatch) {
        hints.discountType = 'percent';
        hints.discountValue = Number(offMatch[1]);
    }

    const gbFree = slug.match(/(\d+)gb-free/i);
    if (gbFree) {
        hints.discountType = 'fixed';
        hints.discountValue = Number(gbFree[1]);
    }

    const complimentaryMonths = slug.match(/complimentary-(\d{1,2})-month/i);
    if (complimentaryMonths) {
        hints.discountType = 'fixed';
        hints.discountValue = Number(complimentaryMonths[1]);
    }

    const dateMatch = slug.match(/-(\d{2}-\d{2}-\d{4})\/?$/);
    if (dateMatch) {
        const [dd, mm, yyyy] = dateMatch[1].split('-');
        hints.validTo = parseDate(`${dd}/${mm}/${yyyy}`);
    }

    if (/buy-one-get-one|bogo/i.test(slug)) {
        hints.discountType = 'percent';
        hints.discountValue = 50;
    }

    const firstSegment = slug.split('-')[0];
    if (firstSegment && firstSegment.length >= 3) {
        hints.merchant = firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
    }

    if (/flexi-instalment|instalment-plans?-on-purchases/i.test(slug) && !hints.merchant) {
        const words = slug.replace(/-flexi-instalment.*/i, '').split('-').filter(Boolean);
        if (words.length >= 2) {
            hints.merchant = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
    }

    return hints;
}

export function parseHsbc($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=hsbc.ae; path=${safePathname(url)}`;
    const warnings = [];
    const offers = [];
    const slugHints = extractHsbcFromSlug(url);
    const isDetail = /\/special-offers\/[^/]+/i.test(url) && !/\/special-offers\/?$/i.test(url);
    const listing = isListingPage(url, $) && !isDetail;

    if (isDetail && slugHints.skipEmit) {
        if (slugHints.validTo && slugHints.merchant) {
            const instalmentOffer = buildStandardBankOffer({
                url,
                title: slugHints.merchant,
                merchant: slugHints.merchant,
                description: cleanText($('p').text()),
                rawText,
                meta,
                bankMeta,
                parserName: PARSER,
                reason: `${reason}; mode=instalment-detail`,
                extraCategories: ['instalment_plan'],
            });
            applySlugHints(instalmentOffer, slugHints);
            offers.push(instalmentOffer);
        }
        return wrapParserResult(offers, ['instalment_slug_tagged'], PARSER);
    }

    if (isDetail && $) {
        const title = cleanText($('h1').first().text())
            || cleanText($('meta[property="og:title"]').attr('content'));
        const description = cleanText($('.text-image-block, .offer-description, .promo-description, article, main, [class*="promo"]').text())
            || cleanText($('meta[property="og:description"]').attr('content'));
        const combined = `${title} ${description} ${rawText}`;

        if (slugHints.discountValue && slugHints.merchant) {
            const usePageTitle = title
                && !/^special offers?$/i.test(title)
                && !isErrorPage(combined)
                && !isCategoryHeaderTitle(title);
            const complimentaryMonths = /complimentary-(\d{1,2})-month/i.test(url);
            const slugTitle = complimentaryMonths
                ? `${slugHints.merchant} Plus ${slugHints.discountValue}-month complimentary`
                : /(\d+)gb-free/i.test(url)
                    ? `Airalo ${slugHints.discountValue}GB free data`
                    : `${slugHints.merchant} ${slugHints.discountValue}% off`;
            const merchant = /(\d+)gb-free/i.test(url) ? 'Airalo SIM' : slugHints.merchant;
            const offer = buildStandardBankOffer({
                url,
                title: usePageTitle && !complimentaryMonths && !/gb-free/i.test(url) ? title : slugTitle,
                merchant,
                description,
                rawText,
                meta,
                bankMeta,
                parserName: PARSER,
                reason: `${reason}; mode=slug-detail`,
                extraCategories: ['merchant_discount'],
            });
            applySlugHints(offer, slugHints);
            offers.push(offer);

            if (slugHints.discountValue === 12 && /careem/i.test(url) && /complimentary/i.test(url)) {
                const pct = detectDiscountType(combined);
                if (pct.discountValue && Number(pct.discountValue) > 1) {
                    const pctOffer = buildStandardBankOffer({
                        url,
                        title: `${slugHints.merchant} ${pct.discountValue}% off`,
                        merchant: slugHints.merchant,
                        description,
                        rawText,
                        meta,
                        bankMeta,
                        parserName: PARSER,
                        reason: `${reason}; mode=careem-percent`,
                        extraCategories: ['merchant_discount'],
                    });
                    if (!offers.some((o) => o.offerTitle === pctOffer.offerTitle)) {
                        offers.push(pctOffer);
                    }
                }
            }
        } else if (title && !isCategoryHeaderTitle(title) && hasOfferSignal(combined, title) && !isEarnRateNoise(combined)) {
            const offer = buildStandardBankOffer({
                url, title,
                merchant: cleanText($(MERCHANT_SELECTORS).first().text())
                    || slugHints.merchant
                    || inferMerchantFromTitle(title)
                    || inferHsbcMerchant(title),
                description, rawText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=detail`,
                extraCategories: ['merchant_discount'],
            });
            applySlugHints(offer, slugHints);
            offers.push(offer);
        }
    }

    if (listing && $ && offers.length === 0) {
        const seen = new Set();
        const crawlDepth = meta.crawlDepth ?? 0;
        $('a[href*="/special-offers/"]').each((_, el) => {
            const absUrl = safeResolve($(el).attr('href'), url);
            if (!absUrl || seen.has(absUrl)) return;
            if (!/\/special-offers\/[^/]+/i.test(absUrl)) return;
            seen.add(absUrl);
            const linkSlug = extractHsbcFromSlug(absUrl);
            if (linkSlug.skipEmit) return;
            if (crawlDepth === 0 && !linkSlug.discountValue) {
                warnings.push('slug_deferred_to_detail_crawl');
                return;
            }
            if (linkSlug.discountValue && linkSlug.merchant) {
                const offer = buildStandardBankOffer({
                    url: absUrl,
                    title: `${linkSlug.merchant} ${linkSlug.discountValue}% off`,
                    merchant: linkSlug.merchant,
                    description: cleanText($(el).text()),
                    rawText: cleanText($(el).text()),
                    meta, bankMeta, parserName: PARSER,
                    reason: `${reason}; mode=listing-slug`,
                    extraCategories: ['merchant_discount'],
                });
                applySlugHints(offer, linkSlug);
                offers.push(offer);
                return;
            }
            if (crawlDepth === 0) {
                warnings.push('slug_deferred_to_detail_crawl');
            }
        });

        $(CARD_SELECTORS).each((_, el) => {
            const card = $(el);
            const cardText = cleanText(card.text());
            const title = cleanText(card.find(TITLE_SELECTORS).first().text()) || cardText.split('\n')[0];
            if (!title || !hasOfferSignal(cardText, title)) return;
            const absUrl = safeResolve(card.find('a[href]').first().attr('href'), url) || url;
            if (seen.has(absUrl)) return;
            seen.add(absUrl);
            if (/\/special-offers\/[^/]+/i.test(absUrl) && crawlDepth === 0) {
                warnings.push('slug_deferred_to_detail_crawl');
                return;
            }
            const cardSlug = extractHsbcFromSlug(absUrl);
            if (cardSlug.skipEmit) return;
            const offer = buildStandardBankOffer({
                url: absUrl, title,
                merchant: cleanText(card.find(MERCHANT_SELECTORS).text()) || inferMerchantFromTitle(title),
                description: cleanText(card.find(DESCRIPTION_SELECTORS).first().text()),
                rawText: cardText, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=listing-card`,
                extraCategories: ['merchant_discount'],
            });
            applySlugHints(offer, cardSlug);
            offers.push(offer);
        });

        $('a[href*="/special-offers/"]').each((_, el) => {
            const absUrl = safeResolve($(el).attr('href'), url);
            if (!absUrl || seen.has(absUrl)) return;
            if (!/\/special-offers\/[^/]+/i.test(absUrl)) return;
            seen.add(absUrl);
            if (crawlDepth === 0) {
                warnings.push('slug_deferred_to_detail_crawl');
                return;
            }
            const cardSlug = extractHsbcFromSlug(absUrl);
            if (cardSlug.skipEmit) return;
            const title = cleanText($(el).text()) || inferHsbcMerchant(absUrl);
            if (!title || !hasOfferSignal(title, title)) return;
            const offer = buildStandardBankOffer({
                url: absUrl, title,
                merchant: inferMerchantFromTitle(title) || inferHsbcMerchant(title) || cardSlug.merchant,
                description: '',
                rawText: title, meta, bankMeta, parserName: PARSER,
                reason: `${reason}; mode=listing-slug-link`,
                extraCategories: ['merchant_discount'],
            });
            applySlugHints(offer, cardSlug);
            offers.push(offer);
        });
    }

    return wrapParserResult(offers, warnings, PARSER);
}

function applySlugHints(offer, slugHints) {
    if (!slugHints) return;
    if (slugHints.discountValue) {
        offer.discountType = slugHints.discountType || offer.discountType || 'percent';
        offer.discountValue = slugHints.discountValue;
    }
    if (slugHints.validTo && !offer.validTo) {
        offer.validTo = slugHints.validTo;
    }
    if (slugHints.merchant && !offer.merchantName) {
        offer.merchantName = slugHints.merchant;
    }
    if (slugHints.categories?.length) {
        offer.categories = [...new Set([...(offer.categories || []), ...slugHints.categories])];
    }
    let boost = 0;
    if (slugHints.discountValue) boost += 0.12;
    if (slugHints.validTo) boost += 0.08;
    if (slugHints.merchant) boost += 0.05;
    if (boost > 0) {
        offer.confidence = Math.min(1, Math.round(((offer.confidence || 0.35) + boost) * 100) / 100);
    }
}

function inferHsbcMerchant(title) {
    if (!title) return null;
    const words = title.split(/\s+/).slice(0, 4).join(' ');
    return words.length >= 3 ? words : null;
}
