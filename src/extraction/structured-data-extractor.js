import { cleanText } from '../utils/normalize.js';

export function extractJsonLd($) {
    if (!$) return [];
    const items = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const parsed = JSON.parse($(el).html());
            if (Array.isArray(parsed)) items.push(...parsed);
            else items.push(parsed);
        } catch {
            // ignore malformed JSON-LD
        }
    });
    return items;
}

export function offersFromJsonLd(jsonLdItems) {
    const offers = [];
    for (const item of jsonLdItems) {
        if (!item) continue;
        if (item['@type'] === 'Offer' || item['@type']?.includes?.('Offer')) {
            offers.push(normalizeJsonLdOffer(item));
        }
        if (item.offers) {
            const nested = Array.isArray(item.offers) ? item.offers : [item.offers];
            for (const o of nested) offers.push(normalizeJsonLdOffer(o));
        }
    }
    return offers.filter((o) => o.offerTitle);
}

function normalizeJsonLdOffer(item) {
    return {
        offerTitle: cleanText(item.name || item.title),
        offerDescription: cleanText(item.description),
        merchantName: cleanText(item.seller?.name || item.brand?.name),
        validTo: item.validThrough || item.priceValidUntil || null,
        discountValue: item.price || null,
        source: 'json-ld',
    };
}

export function extractMetaTags($) {
    if (!$) return {};
    return {
        title: cleanText($('meta[property="og:title"]').attr('content') || $('title').text()),
        description: cleanText($('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content')),
        siteName: cleanText($('meta[property="og:site_name"]').attr('content')),
    };
}
