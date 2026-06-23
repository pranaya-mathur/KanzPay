import crypto from 'crypto';

export function sha256(input) {
    return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function stableHashObject(obj) {
    return sha256(JSON.stringify(obj, Object.keys(obj).sort()));
}

export function buildCanonicalKey(offer) {
    const parts = [
        offer.normalizedUrl || offer.sourceUrl || '',
        (offer.merchantName || '').toLowerCase(),
        (offer.bankName || '').toLowerCase(),
        (offer.offerTitle || '').toLowerCase(),
        (offer.couponCode || '').toLowerCase(),
        offer.discountType || '',
        String(offer.discountValue ?? ''),
    ];
    return sha256(parts.join('::')).slice(0, 64);
}

export function buildDedupeHash(offer) {
    const parts = [
        offer.normalizedUrl || offer.sourceUrl || '',
        (offer.offerTitle || '').toLowerCase(),
        (offer.couponCode || '').toLowerCase(),
    ];
    return sha256(parts.join('::'));
}

export function buildSnapshotHash(offer) {
    const material = {
        offerTitle: offer.offerTitle,
        offerDescription: offer.offerDescription,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        validTo: offer.validTo,
        couponCode: offer.couponCode,
        merchantName: offer.merchantName,
        minSpend: offer.minSpend,
        capValue: offer.capValue,
    };
    return stableHashObject(material);
}
