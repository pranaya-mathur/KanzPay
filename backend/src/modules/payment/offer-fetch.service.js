/**
 * Enhanced offer fetching + crawled coupon merge for payment/checkout.
 */
import { findOffers } from '../offers/offers.repository.js';
import { resolveMerchantSearchTerms } from '../merchants/merchants.repository.js';
import logger from '../../shared/utils/logger.js';

const CRAWL_COUPON_CONFIDENCE = 0.65;

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
            queries.push(findOffers({ merchant: term, freshnessStatus: 'fresh', validNow: true, limit: 50 }));
        }
        if (ctx.merchantCategory) {
            queries.push(findOffers({ category: ctx.merchantCategory, freshnessStatus: 'fresh', validNow: true, limit: 50 }));
        }
        queries.push(findOffers({ freshnessStatus: 'fresh', validNow: true, limit: 100 }));

        const couponQuery = findOffers({
            freshnessStatus: 'fresh',
            validNow: true,
            limit: 50,
            ...(searchTerms[0] ? { merchant: searchTerms[0] } : {}),
        });

        const results = await Promise.all([...queries, couponQuery]);
        const allOffers = [];
        const seen = new Set();

        for (const r of results) {
            for (const o of r.data || []) {
                if (seen.has(o.id)) continue;
                seen.add(o.id);
                allOffers.push(o);
            }
        }

        const crawledCoupons = [];
        const applicableOffersMeta = [];
        const dbOffers = [];

        for (const offer of allOffers) {
            if (offer.couponCode) {
                const couponInstrument = offerToCouponInstrument(offer);
                crawledCoupons.push(couponInstrument);
                applicableOffersMeta.push({
                    offerId: offer.id,
                    from: 'crawled',
                    type: 'coupon',
                    verifyRequired: (offer.confidence ?? 0) < CRAWL_COUPON_CONFIDENCE,
                    title: offer.offerTitle,
                    merchantName: offer.merchantName,
                });
            } else {
                dbOffers.push(offer);
                applicableOffersMeta.push({
                    offerId: offer.id,
                    from: 'crawled',
                    type: offer.discountType === 'coupon' ? 'coupon' : 'card_offer',
                    verifyRequired: (offer.confidence ?? 0) < CRAWL_COUPON_CONFIDENCE,
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

function offerToCouponInstrument(offer) {
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
        programName: offer.offerTitle || offer.merchantName || 'Crawled offer',
        enabled: true,
        source: 'crawled',
        offerId: offer.id,
        verifyRequired: (offer.confidence ?? 0) < CRAWL_COUPON_CONFIDENCE,
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
