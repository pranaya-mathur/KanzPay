import { createOfferBase } from '../schema/offerSchema.js';
import {
    extractMatch, PATTERNS, detectCategories, detectDiscountType, extractPaymentMethods,
} from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';

export function matchVisaUae(url) {
    return /visamiddleeast\.com|visa\.co\.ae|visa\.com\/.*(?:uae|ae|en_ae)/i.test(url);
}

export function parseVisaUae($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=visa; path=${new URL(url).pathname}`;
    const offers = [];
    const pathname = new URL(url).pathname;
    const isListing = /\/visa-offers-and-perks\/?$|\/offers?\/?$|\/perks?\/?$/i.test(pathname);
    const isDetail = /\/visa-offers-and-perks\/[^/]+\/\d+/i.test(pathname);

    if (isListing && $) {
        offers.push(...extractVisaListingOffers($, url, rawText, meta, reason));
    }

    if (isDetail && $) {
        const detail = extractVisaDetailOffer($, url, rawText, meta, reason);
        if (detail) offers.push(detail);
    }

    if (offers.length === 0) {
        const title = cleanText($?.('h1, h2.offer-title, .hero-title').first().text())
            || cleanText($?.('title').text());
        const description = cleanText($?.('.offer-detail, .content, article, .vs-card-content').text())
            || cleanText($?.('p').text());

        if (title && title.length > 4 && !/try one of these popular/i.test(rawText || '')) {
            offers.push(buildVisaOffer({
                url,
                title,
                description,
                rawText,
                meta,
                reason: `${reason}; mode=fallback`,
            }));
        }
    }

    return offers;
}

function extractVisaListingOffers($, url, rawText, meta, reason) {
    const offers = [];
    const seen = new Set();

    $('.vs-card, .offer-card, a[href*="/visa-offers-and-perks/"]').each((_, el) => {
        const card = $(el);
        const link = card.is('a') ? card : card.find('a[href*="/visa-offers-and-perks/"]').first();
        const href = link.attr('href');
        if (!href || !/\/visa-offers-and-perks\/[^/]+\/\d+/i.test(href)) return;

        const absUrl = href.startsWith('http') ? href : new URL(href, url).href;
        if (seen.has(absUrl)) return;

        const cardText = cleanText(card.text());
        const title = cleanText(card.find('h2, h3, .vs-card-title, [class*="title"]').first().text())
            || cleanText(link.text())
            || slugToTitle(new URL(absUrl).pathname);
        if (!title || title.length < 2) return;

        seen.add(absUrl);
        offers.push(buildVisaOffer({
            url: absUrl,
            title,
            description: cardText,
            rawText: cardText || rawText,
            meta,
            reason: `${reason}; mode=listing-card`,
        }));
    });

    return offers;
}

function extractVisaDetailOffer($, url, rawText, meta, reason) {
    const title = cleanText($('h1, h2, .vs-card-title').first().text())
        || slugToTitle(new URL(url).pathname);
    const description = cleanText($('.vs-card-content, .offer-detail, article, main').text())
        || cleanText($('p').text());

    if (!title || title.length < 3) return null;

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
    const offer = createOfferBase({
        sourceUrl: url,
        sourceType: 'visaUAE',
        parserName: 'visaUaeParser',
        parserReason: reason,
        crawlDepth: meta.crawlDepth,
    });

    const combined = `${title} ${description} ${rawText}`;
    const { discountType, discountValue } = detectDiscountType(combined);

    offer.cardName = 'Visa';
    offer.merchantName = title;
    offer.offerTitle = title;
    offer.offerDescription = description;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.couponCode = extractMatch(rawText, PATTERNS.couponCode);
    offer.validTo = extractMatch(rawText, PATTERNS.validity);
    offer.paymentMethods = extractPaymentMethods(rawText);
    if (!offer.paymentMethods.length) offer.paymentMethods = ['Visa'];
    offer.categories = detectCategories(combined);
    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, rawText);
    offer.rawText = rawText;
    return offer;
}

function slugToTitle(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts[parts.length - 2] || parts[parts.length - 1] || '';
    if (!slug || slug === 'visa-offers-and-perks') return null;
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
