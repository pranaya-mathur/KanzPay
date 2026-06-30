/**
 * Enhanced offer fetching + crawled coupon merge for payment/checkout.
 */
import { findOffers } from '../offers/offers.repository.js';
import { resolveMerchantSearchTerms } from '../merchants/merchants.repository.js';
import config from '../../config.js';
import logger from '../../shared/utils/logger.js';

const CHECKOUT_OFFER_FILTERS = {
    freshnessStatus: 'fresh',
    validNow: true,
};

function resolveVerifyRequired(offer) {
    if (offer.verifyRequired) return true;
    if (offer.validityStatus === 'unknown') return true;
    return (offer.confidence ?? 0) < config.crawlCouponConfidence;
}

export { resolveVerifyRequired };

/**
 * @param {object} ctx - Normalized payment context
 * @returns {Promise<{ dbOffers: object[], crawledCoupons: object[], applicableOffersMeta: object[] }>}
 */
export async function fetchApplicableOffersWithCoupons(ctx) {
    try {
        const searchTerms = ctx.merchantName && ctx.merchantName !== 'Unknown Merchant'
            ? await resolveMerchantSearchTerms(ctx.merchantName)
            : [ctx.merchantName].filter(Boolean);

        const queries = [];
        for (const term of searchTerms) {
            queries.push(findOffers({ ...CHECKOUT_OFFER_FILTERS, merchant: term, limit: 50 }));
        }
        if (ctx.merchantCategory) {
            queries.push(findOffers({ ...CHECKOUT_OFFER_FILTERS, category: ctx.merchantCategory, limit: 50 }));
        }

        const results = await Promise.all(queries);
        const allOffers = [];
        const seen = new Set();

        for (const r of results) {
            for (const o of r.data || []) {
                if (seen.has(o.id)) continue;
                seen.add(o.id);
                allOffers.push(o);
            }
        }

        // Only fall back to a broad unscoped query when no merchant-specific results were found.
        if (allOffers.length === 0) {
            const broad = await findOffers({ ...CHECKOUT_OFFER_FILTERS, limit: 100 });
            for (const o of broad.data || []) {
                if (seen.has(o.id)) continue;
                seen.add(o.id);
                allOffers.push(o);
            }
        }

        const crawledCoupons = [];
        const applicableOffersMeta = [];
        const dbOffers = [];

        for (const offer of allOffers) {
            if (offer.validityStatus === 'expired' || offer.validityStatus === 'not_yet_active') {
                continue;
            }

            const verifyRequired = resolveVerifyRequired(offer);

            if (offer.couponCode) {
                const couponInstrument = offerToCouponInstrument(offer, verifyRequired);
                crawledCoupons.push(couponInstrument);
                applicableOffersMeta.push({
                    offerId: offer.id,
                    from: 'crawled',
                    type: 'coupon',
                    verifyRequired,
                    validityStatus: offer.validityStatus,
                    confidence: offer.confidence,
                    title: offer.offerTitle,
                    merchantName: offer.merchantName,
                });
            } else {
                dbOffers.push(offer);
                applicableOffersMeta.push({
                    offerId: offer.id,
                    from: 'crawled',
                    type: offer.discountType === 'coupon' ? 'coupon' : 'cardOffer',
                    verifyRequired,
                    validityStatus: offer.validityStatus,
                    confidence: offer.confidence,
                    title: offer.offerTitle,
                    bankName: offer.bankName,
                });
            }
        }

        return { dbOffers, crawledCoupons, applicableOffersMeta };
    } catch (err) {
        logger.warn('Failed to fetch applicable offers from DB', { error: err.message });
        return { dbOffers: [], crawledCoupons: [], applicableOffersMeta: [] };
    }
}

function offerToCouponInstrument(offer, verifyRequired) {
    const discountType = normalizeDiscountType(offer.discountType);
    let discountValue = parseFloat(offer.discountValue) || 0;
    if (discountType === 'percent' && discountValue > 0 && discountValue <= 1) {
        discountValue *= 100;
    }

    return {
        code: offer.couponCode.toUpperCase(),
        discountType,
        discountValue,
        minSpend: offer.minSpend,
        maxDiscount: offer.capValue,
        expiresAt: offer.validTo || null,
        programName: offer.offerTitle || offer.merchantName || 'Crawled offer',
        enabled: true,
        source: 'crawled',
        offerId: offer.id,
        verifyRequired: verifyRequired ?? offer.verifyRequired ?? ((offer.confidence ?? 0) < config.crawlCouponConfidence),
    };
}

function normalizeDiscountType(type) {
    if (!type) return 'percent';
    const t = String(type).toLowerCase();
    if (t.includes('fixed') || t.includes('flat')) return 'fixed';
    if (t.includes('percent') || t.includes('cashback') || t === 'coupon') return 'percent';
    return 'percent';
}

/**
 * Merge wallet coupons with crawled coupons; wallet wins on duplicate codes.
 */
export function mergeCouponInstruments(walletCoupons = [], crawledCoupons = []) {
    const byCode = new Map();
    for (const c of crawledCoupons) {
        if (c.code) byCode.set(c.code.toUpperCase(), { ...c, source: 'crawled' });
    }
    for (const c of walletCoupons) {
        const code = c.code?.toUpperCase();
        if (code) byCode.set(code, { ...c, source: 'wallet' });
    }
    return [...byCode.values()];
}
