/**
 * Visa UAE parser v2 — listing-first, skips generic detail shells.
 */
import { createOfferBase } from '../schema/offerSchema.js';
import {
    extractMatch, PATTERNS, detectCategories, detectDiscountType, extractPaymentMethods,
} from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';
import { PARSER_VERSION } from '../sources/source-registry.js';
import { isCategoryHeaderTitle } from '../validation/quality-rules.js';

export function matchVisa(url) {
    return /visamiddleeast\.com|visa\.co\.ae|visa\.com\/.*(?:uae|ae|en_ae)/i.test(url);
}

export function parseVisa($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=visa; path=${new URL(url).pathname}`;
    const warnings = [];
    const offers = [];
    const pathname = new URL(url).pathname;
    const isListing = /\/visa-offers-and-perks\/?$/i.test(pathname);
    const isDetail = /\/visa-offers-and-perks\/.+\/\d+\/?$/i.test(pathname);

    if (isListing && $) {
        offers.push(...extractVisaListingOffers($, url, rawText, meta, reason));
    }

    if (isDetail && $) {
        const detail = extractVisaDetailOffer($, url, rawText, meta, reason);
        if (detail) offers.push(detail);
        else warnings.push('detail_shell_skipped');
    }

    if (offers.length === 0 && $) {
        const listingFallback = extractVisaListingOffers($, url, rawText, meta, `${reason}; mode=embedded-listing`);
        if (listingFallback.length) {
            offers.push(...listingFallback);
            warnings.push('extracted_from_embedded_cards');
        }
    }

    if (offers.length === 0 && $) {
        const title = cleanText($('h1, h2.offer-title, .hero-title').first().text())
            || cleanText($('title').text());
        const description = cleanText($('.offer-detail, .content, article, .vs-card-content').text())
            || cleanText($('p').text());
        const combined = `${title} ${description} ${rawText}`;

        if (title && title.length > 4
            && !isCategoryHeaderTitle(title, 'visaUAE')
            && !/try one of these popular/i.test(rawText || '')
            && /(?:cashback|%\s*off|AED\s*\d|discount|valid\s+until)/i.test(combined)) {
            const built = buildVisaOffer({
                url,
                title,
                description,
                rawText,
                meta,
                reason: `${reason}; mode=text-fallback`,
            });
            if (built) {
                offers.push(built);
                warnings.push('text_fallback_used');
            }
        }
    }

    return {
        offers: offers.map((o) => ({
            ...o,
            parserName: 'visaParser',
            parserVersion: PARSER_VERSION,
            pageType: meta.pageType || (isListing ? 'listing' : isDetail ? 'detail' : null),
        })),
        warnings,
    };
}

// Brand-level "Visa …" slugs that are not real merchant names
const VISA_GENERIC_SLUGS = /^visa\s+(destinations|offers?|deals?|infinite|signature|platinum|gold|classic|cardholders?|premium|privileges?)$/i;

function extractVisaListingOffers($, url, rawText, meta, reason) {
    const offers = [];
    const seenUrl = new Set();
    const seenTitle = new Set(); // dedup identical titles (e.g. "Visa Destinations" ×2)

    $('.vs-card, .offer-card, a[href*="/visa-offers-and-perks/"]').each((_, el) => {
        const card = $(el);
        const link = card.is('a') ? card : card.find('a[href*="/visa-offers-and-perks/"]').first();
        const href = link.attr('href');
        if (!href || !/\/visa-offers-and-perks\/.+\/\d+/i.test(href)) return;

        const absUrl = href.startsWith('http') ? href : new URL(href, url).href;
        if (seenUrl.has(absUrl)) return;

        const cardText = cleanText(card.text());
        const title = cleanText(card.find('h2, h3, .vs-card-title, [class*="title"]').first().text())
            || cleanText(link.text())
            || merchantFromSlug(new URL(absUrl).pathname);
        if (!title || title.length < 2 || isCategoryHeaderTitle(title, 'visaUAE')) return;

        // Skip duplicate titles (same merchant listed twice on the page)
        const titleKey = title.toLowerCase().trim();
        if (seenTitle.has(titleKey)) return;

        const combined = `${title} ${cardText}`;
        const hasDiscountSignal = /\d+\s*%|cashback|AED\s*\d|discount|complimentary|free\s+\w+/i.test(combined);
        const slugMerchant = merchantFromSlug(new URL(absUrl).pathname);
        const merchantIsTitle = !slugMerchant || VISA_GENERIC_SLUGS.test(slugMerchant);

        // Skip hollow offers: title copied as merchant AND no discount signal
        if (merchantIsTitle && !hasDiscountSignal) return;

        seenUrl.add(absUrl);
        seenTitle.add(titleKey);
        const built = buildVisaOffer({
            url: absUrl,
            title,
            description: cardText,
            rawText: cardText || rawText,
            meta,
            reason: `${reason}; mode=listing-card`,
        });
        if (built) offers.push(built);
    });

    return offers;
}

function extractVisaDetailOffer($, url, rawText, meta, reason) {
    const title = cleanText($('h1, h2, .vs-card-title').first().text())
        || merchantFromSlug(new URL(url).pathname);
    const description = cleanText($('.vs-card-content, .offer-detail, article, main').text())
        || cleanText($('p').text());

    if (!title || title.length < 3) return null;
    if (isCategoryHeaderTitle(title, 'visaUAE')) return null;
    if (/try one of these popular/i.test(rawText || '')) return null;
    if (!description && !/\d+\s*%|cashback|discount/i.test(rawText || '')) return null;

    return buildVisaOffer({
        url,
        title,
        description,
        rawText: description || rawText,
        meta,
        reason: `${reason}; mode=detail`,
    });
}

function buildVisaOffer({ url, title, description, rawText, meta, reason }) {
    const combined = `${title} ${description} ${rawText}`;
    if (!isVisaUaeRelevant(combined, url)) return null;

    const offer = createOfferBase({
        sourceUrl: url,
        sourceType: 'visaUAE',
        parserName: 'visaParser',
        parserReason: reason,
        crawlDepth: meta.crawlDepth,
    });

    const { discountType, discountValue } = detectDiscountType(combined);

    offer.cardName = 'Visa';
    const slugMerchant = merchantFromSlug(new URL(url).pathname);
    offer.merchantName = (slugMerchant && !VISA_GENERIC_SLUGS.test(slugMerchant))
        ? slugMerchant
        : title;
    offer.offerTitle = title;
    offer.offerDescription = description;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.couponCode = extractMatch(rawText, PATTERNS.couponCode);
    offer.validTo = extractMatch(rawText, PATTERNS.validity);
    offer.paymentMethods = extractPaymentMethods(rawText);
    if (!offer.paymentMethods.length) offer.paymentMethods = ['Visa'];
    offer.categories = [...new Set([...detectCategories(combined), 'network_perk'])];
    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, rawText);
    offer.rawText = rawText;
    return offer;
}

function merchantFromSlug(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts[parts.length - 2] || parts[parts.length - 1] || '';
    if (!slug || slug === 'visa-offers-and-perks' || /^\d+$/.test(slug)) return null;
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isVisaUaeRelevant(text, url = '') {
    const combined = `${text} ${url}`.toLowerCase();
    if (/uae|dubai|abu\s+dhabi|sharjah|\.ae\b|emirates|middle\s+east/i.test(combined)) return true;
    if (/bangkok|malaysia|mexico|singapore|thailand|india\b|uk\b|london/i.test(combined)) return false;
    return true;
}
