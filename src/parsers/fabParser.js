import { createOfferBase } from '../schema/offerSchema.js';
import {
    extractMatch, PATTERNS, detectCategories, detectDiscountType, extractPaymentMethods,
} from '../utils/extractPatterns.js';
import { cleanText } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';

export function matchFab(url) {
    return /bankfab\.com/i.test(url);
}

export function parseFab($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=bankfab.com; path=${new URL(url).pathname}`;
    const offers = [];
    const isListing = /\/offers?\/?$|\/rewards?\/?$|\/promotions?\/?$/i.test(url);

    if (isListing && $) {
        const seen = new Set();
        $('.offer, .card, .promo-card, a[href*="offer"]').each((_, el) => {
            const card = $(el);
            const link = card.is('a') ? card : card.find('a').first();
            const href = link.attr('href');
            const title = cleanText(card.find('h2, h3, .title').first().text()) || cleanText(link.text());
            if (!title || title.length < 5) return;
            const absUrl = href ? (href.startsWith('http') ? href : new URL(href, url).href) : url;
            const key = `${absUrl}::${title}`;
            if (seen.has(key)) return;
            seen.add(key);
            offers.push(buildFabOffer({
                url: absUrl,
                title,
                description: cleanText(card.find('p').text()),
                rawText: cleanText(card.text()) || rawText,
                meta,
                reason: `${reason}; mode=listing`,
            }));
        });
    }

    if (offers.length === 0) {
        const title = cleanText($?.('h1, .offer-title').first().text()) || cleanText($?.('title').text());
        const description = cleanText($?.('.offer-details, .content, article').text())
            || cleanText($?.('p').text());

        if (title && title.length > 4 && !/oops|not found/i.test(title)) {
            offers.push(buildFabOffer({
                url,
                title,
                description,
                rawText,
                meta,
                reason: `${reason}; mode=detail`,
            }));
        }
    }

    return offers;
}

function buildFabOffer({ url, title, description, rawText, meta, reason }) {
    const offer = createOfferBase({
        sourceUrl: url,
        sourceType: 'fab',
        parserName: 'fabParser',
        parserReason: reason,
        crawlDepth: meta.crawlDepth,
    });

    const combined = `${title} ${description} ${rawText}`;
    const { discountType, discountValue } = detectDiscountType(combined);

    offer.bankName = 'First Abu Dhabi Bank';
    offer.merchantName = extractMatch(title, /(?:at|with|from)\s+([A-Za-z0-9&'\s.-]{2,40})/i);
    offer.offerTitle = title;
    offer.offerDescription = description;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.minSpend = toNum(extractMatch(rawText, PATTERNS.minSpend) || extractMatch(rawText, PATTERNS.minMonthlySpend));
    offer.capValue = toNum(extractMatch(rawText, PATTERNS.cap));
    offer.validTo = extractMatch(rawText, PATTERNS.validity);
    offer.couponCode = extractMatch(rawText, PATTERNS.couponCode);
    offer.paymentMethods = extractPaymentMethods(rawText);
    if (!offer.paymentMethods.length) offer.paymentMethods = ['FAB Card'];

    if (PATTERNS.lounge.test(combined)) {
        offer.categories = [...detectCategories(combined), 'travel'];
    } else {
        offer.categories = detectCategories(combined);
    }

    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, rawText);
    offer.rawText = rawText;
    return offer;
}

function toNum(v) {
    if (!v) return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}
