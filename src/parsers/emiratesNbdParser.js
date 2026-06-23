import { createDefaultOffer } from '../schema/offerSchema.js';
import {
    extractMatch, PATTERNS, detectCategories, detectDiscountType, extractPaymentMethods,
} from '../utils/extractPatterns.js';
import { cleanText, parseDate } from '../utils/normalize.js';
import { scoreConfidence } from '../utils/confidence.js';

const DEAL_LINK_SELECTOR = 'a[href*="/deals/"][data-ctatext], a.stretched-link[href*="/deals/"], a[href*="/deals/"][href*="/en/deals/"]';

export function matchEmiratesNbd(url) {
    return /emiratesnbd\.com/i.test(url);
}

export function parseEmiratesNbd($, url, rawText, rawHtml, meta = {}) {
    const reason = `domain=emiratesnbd.com; path=${new URL(url).pathname}`;
    const offers = [];
    const pathname = new URL(url).pathname;

    const isListing = /\/deals\/?$/.test(pathname) || /\/promotions\/?$/.test(pathname);
    const isDetail = /\/deals\/[^/]+\/[^/]+/.test(pathname);

    if (isListing && $) {
        offers.push(...extractListingOffers($, url, rawText, meta, reason));
    }

    if (isDetail && $) {
        const detail = extractDetailOffer($, url, rawText, meta, reason);
        if (detail) offers.push(detail);
    }

    // PDF or text-only fallback
    if (offers.length === 0 && rawText && !/oops|page not found/i.test(rawText)) {
        const title = extractTitleFromText(rawText) || slugToTitle(pathname);
        if (title) {
            offers.push(buildEnbdOffer({
                url,
                title,
                description: rawText.slice(0, 2000),
                rawText,
                meta,
                reason: `${reason}; mode=text-fallback`,
            }));
        }
    }

    return offers;
}

function extractListingOffers($, url, rawText, meta, reason) {
    const offers = [];
    const seen = new Set();

    $(DEAL_LINK_SELECTOR).each((_, el) => {
        const link = $(el);
        const href = link.attr('href');
        if (!href || href.includes('deal-search') || /\/deals\/?$/.test(href)) return;

        const absUrl = href.startsWith('http') ? href : new URL(href, url).href;
        if (seen.has(absUrl)) return;

        const ctaText = cleanText(link.attr('data-ctatext'));
        const parent = link.closest('.swiper-slide, .card, [class*="deal"], .col, li, article');
        const parentText = cleanText(parent.text());
        const title = ctaText
            || extractMerchantFromParent(parentText)
            || slugToTitle(new URL(absUrl).pathname);

        if (!title || title.length < 3) return;
        // Skip brand-logo-only cards with no deal text
        if (!parentText && !ctaText) return;
        seen.add(absUrl);

        const discountLine = parentText.split('\n').map(cleanText).find((l) => /%|discount|off|cashback/i.test(l));
        const expiryLine = parentText.match(/Expires?\s+on:?\s*([0-9/.-]+)/i);

        offers.push(buildEnbdOffer({
            url: absUrl,
            title,
            description: parentText || discountLine || title,
            rawText: parentText || rawText,
            meta,
            reason: `${reason}; mode=listing-card`,
            preDiscount: discountLine,
            preExpiry: expiryLine ? expiryLine[1] : null,
            listingMode: true,
        }));
    });

    return offers;
}

function extractDetailOffer($, url, rawText, meta, reason) {
    const dealInfo = cleanText($('.deal-info, .deal-details, [class*="deal-detail"]').text());
    const pageTitle = cleanText($('title').text());
    const title = cleanText($('h1').first().text())
        || (pageTitle ? pageTitle.split('|')[0].trim() : null)
        || extractMerchantFromParent(dealInfo)
        || slugToTitle(new URL(url).pathname);

    if (!title || /oops|not found/i.test(title)) return null;

    return buildEnbdOffer({
        url,
        title,
        description: dealInfo || cleanText($('article, main').text()).slice(0, 2000),
        rawText: dealInfo || rawText,
        meta,
        reason: `${reason}; mode=detail`,
    });
}

function buildEnbdOffer({ url, title, description, rawText, meta, reason, preDiscount, preExpiry, listingMode }) {
    const offer = createDefaultOffer({
        sourceUrl: url,
        sourceType: 'emiratesNbd',
        parserName: 'emiratesNbdParser',
        parserReason: reason,
        crawlDepth: meta.crawlDepth,
    });

    const discountSource = listingMode
        ? `${preDiscount || ''} ${title}`
        : `${preDiscount || ''} ${title} ${description} ${rawText}`;
    const { discountType, discountValue } = detectDiscountType(discountSource);

    const metaText = listingMode ? description : `${description} ${rawText}`;

    // Strip trailing expiry/date noise from titles like "Merchant Expires on 31 Mar…"
    // Also strip raw domain strings (e.g. "www.amazon.ae") that crept in as titles
    const cleanTitle = title
        .replace(/\s+Expires?\s+on:?\s*[\d/.-]+.*/i, '')
        .replace(/^(?:https?:\/\/|www\.)\S+\s*/i, '')
        .trim();

    offer.bankName = 'Emirates NBD';
    offer.merchantName = cleanTitle || title;
    offer.offerTitle = preDiscount && listingMode
        ? `${preDiscount} at ${cleanTitle}`
        : cleanTitle;
    offer.offerDescription = description;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.minSpend = toNum(extractMatch(metaText, PATTERNS.minSpend));
    offer.capValue = toNum(extractMatch(metaText, PATTERNS.cap));
    offer.validTo = parseDate(preExpiry)
        || parseDate(extractMatch(metaText, /Expires?\s+on:?\s*([0-9/.-]+)/i))
        || parseDate(extractMatch(metaText, PATTERNS.validity));
    offer.couponCode = extractMatch(metaText, PATTERNS.couponCode);
    offer.paymentMethods = extractPaymentMethods(metaText);
    if (!offer.paymentMethods.includes('Emirates NBD Card')) {
        offer.paymentMethods.push('Emirates NBD Card');
    }
    offer.categories = detectCategories(listingMode ? `${title} ${description}` : `${title} ${description} ${rawText}`);
    offer.termsUrl = extractTermsUrl(metaText);
    offer.pageLength = (rawText || '').length;
    offer.confidence = scoreConfidence(offer, listingMode ? description : `${title} ${description} ${rawText}`);
    offer.rawText = rawText;
    return offer;
}

function extractMerchantFromParent(text) {
    if (!text) return null;
    const lines = text.split('\n').map(cleanText).filter(Boolean);
    // Skip discount lines, navigation labels, expiry noise, and raw URLs
    const skip = /^(?:\d+%|discount|offer|show all|expires?|valid|terms|https?:\/\/|www\.)/i;
    const merchant = lines.find((l) => l.length > 2 && l.length < 80 && !skip.test(l));
    return merchant || null;
}

function extractTitleFromText(text) {
    const m = text.match(/([A-Za-z0-9&'. -]{4,60})\s*\|\s*Deals/i);
    return m ? cleanText(m[1]) : null;
}

function slugToTitle(pathname) {
    const slug = pathname.split('/').filter(Boolean).pop() || '';
    if (!slug || slug === 'deals') return null;
    return slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractTermsUrl(text) {
    const m = text.match(/(https?:\/\/\S+\.pdf)/i);
    return m ? m[1] : null;
}

function toNum(v) {
    if (!v) return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}
