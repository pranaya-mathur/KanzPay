import { buildCanonicalKey, buildDedupeHash } from '../../shared/utils/hash.js';
import { normalizeUrl } from '../../shared/utils/url-normalize.js';
import { cleanText, slugify } from '../../shared/utils/text-normalize.js';

export function generateCanonicalKey(offer) {
    return buildCanonicalKey(offer);
}

export function generateDedupeHash(offer) {
    return buildDedupeHash(offer);
}

export function areLikelyDuplicates(a, b) {
    if (!a || !b) return false;

    if (a.canonicalKey && b.canonicalKey && a.canonicalKey === b.canonicalKey) return true;

    const urlA = normalizeUrl(a.normalizedUrl || a.sourceUrl);
    const urlB = normalizeUrl(b.normalizedUrl || b.sourceUrl);
    if (urlA && urlA === urlB) {
        const titleA = slugify(a.offerTitle || '');
        const titleB = slugify(b.offerTitle || '');
        const codeA = cleanText(a.couponCode).toLowerCase();
        const codeB = cleanText(b.couponCode).toLowerCase();
        if (titleA === titleB && codeA === codeB) return true;
    }

    if (generateDedupeHash(a) === generateDedupeHash(b)) return true;

    // Fuzzy: same merchant + bank + similar title on same host
    const hostA = tryHost(urlA);
    const hostB = tryHost(urlB);
    if (hostA && hostA === hostB
        && slugify(a.merchantName) && slugify(a.merchantName) === slugify(b.merchantName)
        && slugify(a.bankName) === slugify(b.bankName)
        && titleSimilarity(a.offerTitle, b.offerTitle) >= 0.85) {
        return true;
    }

    return false;
}

export function pickPreferredOffer(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    if ((incoming.confidence || 0) > (existing.confidence || 0)) return incoming;
    if ((incoming.confidence || 0) < (existing.confidence || 0)) return existing;

    const incomingFields = countFilledFields(incoming);
    const existingFields = countFilledFields(existing);
    if (incomingFields > existingFields) return incoming;
    if (incomingFields < existingFields) return existing;

    return incoming;
}

function countFilledFields(offer) {
    return [
        offer.offerTitle, offer.merchantName, offer.discountType, offer.discountValue,
        offer.validTo, offer.couponCode, offer.offerDescription,
    ].filter((v) => v != null && String(v).length > 0).length;
}

function titleSimilarity(a, b) {
    const sa = slugify(a || '');
    const sb = slugify(b || '');
    if (!sa || !sb) return 0;
    if (sa === sb) return 1;
    if (sa.includes(sb) || sb.includes(sa)) return 0.9;
    return 0;
}

function tryHost(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}
