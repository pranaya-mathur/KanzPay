const GENERIC_BLOCKLIST = [
    '/private-banking', '/priority-banking', '/business', '/corporate-banking',
    '/about-us', '/careers', '/investor-relations', '/sustainability',
    '/privacy-policy', '/contact-us', '/help-centre', '/help-center',
    '/help-and-support', '/atm-branches', '/branches-atms', '/emirati',
    '/loans/', '/accounts/', '/login', '/sign-in', '/signin', '/register',
    '/cookie', '/fatca', '/media-centre', '/media-center', '/investor',
    '/schedule-of-charges', '/key-facts', '/application-form',
    '/ways-of-banking', '/digital-banking', '/online-banking',
    '/mobile-banking', '/phone-banking', '/sitemap', '/search',
    '/knowledge-hub', '/fraud', '/complaint',
];

const OFFER_KEYWORDS = [
    'deal', 'offer', 'promo', 'promotion', 'benefit', 'reward', 'perk',
    'coupon', 'cashback', 'discount', 'campaign', 'mastercard', 'visa-offer',
];

/** Coupon aggregator sourceTypes — share coupon link-following rules. */
const COUPON_SOURCE_TYPES = new Set([
    'couponFeed', 'groupon', 'cuponation', 'picodi', 'couponsAe', 'wethrift', 'smiles', 'noon',
]);

const BANK_OFFER_SOURCE_TYPES = new Set([
    'adcb', 'mashreq', 'rakBank', 'dib', 'hsbc', 'citibank', 'cbd', 'mastercard', 'adib', 'fab',
]);

function isCouponSourceType(sourceType) {
    return COUPON_SOURCE_TYPES.has(sourceType);
}

function isBankOfferSourceType(sourceType) {
    return BANK_OFFER_SOURCE_TYPES.has(sourceType);
}

const EMIRATES_NBD_OFFER_PATHS = [
    '/deals/', '/deals?', '/promotions/',
    '/cards/deals/', '/offers/', '/mastercard-benefits',
];

export function shouldFollowLink(url, sourceType) {
    const lower = url.toLowerCase();

    if (GENERIC_BLOCKLIST.some((block) => lower.includes(block))) {
        return { follow: false, reason: 'blocked:generic-noise' };
    }

    if (/\.(jpg|jpeg|png|gif|svg|css|js|woff|ico)(\?|$)/i.test(lower)) {
        return { follow: false, reason: 'blocked:asset' };
    }

    if (sourceType === 'emiratesNbd' || lower.includes('emiratesnbd.com')) {
        const isOfferPath = EMIRATES_NBD_OFFER_PATHS.some((p) => lower.includes(p));
        const isPdf = lower.endsWith('.pdf');
        if (isOfferPath || isPdf) {
            return { follow: true, reason: 'enbd:offer-path' };
        }
        // Allow deal detail pages under /en/deals/merchant-name
        if (/\/deals\/[a-z0-9-]+/i.test(lower)) {
            return { follow: true, reason: 'enbd:deal-detail' };
        }
        return { follow: false, reason: 'enbd:non-offer-path' };
    }

    if (sourceType === 'visaUAE' || lower.includes('visamiddleeast.com') || lower.includes('visa.co.ae') || lower.includes('visa.com')) {
        const visaOffer = /\/visa-offers-and-perks\/|\/offers?\/|\/perks?\/|\/promotions?\//i.test(lower)
            || OFFER_KEYWORDS.some((kw) => lower.includes(kw));
        return visaOffer
            ? { follow: true, reason: 'visa:offer-path' }
            : { follow: false, reason: 'visa:non-offer-path' };
    }

    if (sourceType === 'fab' || lower.includes('bankfab.com')) {
        const fabOffer = /\/offers?\/|\/rewards?\/|\/promotions?\//i.test(lower)
            || OFFER_KEYWORDS.some((kw) => lower.includes(kw));
        return fabOffer
            ? { follow: true, reason: 'fab:offer-path' }
            : { follow: false, reason: 'fab:non-offer-path' };
    }

    if (sourceType === 'hsbc' || lower.includes('hsbc.ae')) {
        if (/\/special-offers\//i.test(lower)) {
            return { follow: true, reason: 'hsbc:offer-path' };
        }
        const hsbcOffer = /\/offers?\/|\/promotions?\/|\/deals?\/|\/rewards?\/|\/benefits?\//i.test(lower)
            || OFFER_KEYWORDS.some((kw) => lower.includes(kw));
        return hsbcOffer
            ? { follow: true, reason: 'hsbc:offer-path' }
            : { follow: false, reason: 'hsbc:non-offer-path' };
    }

    if (sourceType === 'adib' || lower.includes('adib.ae')) {
        const adibOffer = /\/offers?\/|\/promotions?\/|\/cards?\//i.test(lower)
            || OFFER_KEYWORDS.some((kw) => lower.includes(kw));
        return adibOffer
            ? { follow: true, reason: 'adib:offer-path' }
            : { follow: false, reason: 'adib:non-offer-path' };
    }

    if (sourceType === 'couponFeed' || isCouponSourceType(sourceType)) {
        const couponOffer = OFFER_KEYWORDS.some((kw) => lower.includes(kw))
            || /\/(?:coupons?|promo|deals?|vouchers?|offers?|stores?|brands?)\//i.test(lower);
        return couponOffer
            ? { follow: true, reason: 'coupon:offer-path' }
            : { follow: false, reason: 'coupon:non-offer-path' };
    }

    if (isBankOfferSourceType(sourceType)) {
        const bankOffer = /\/offers?\/|\/promotions?\/|\/deals?\/|\/rewards?\/|\/benefits?\//i.test(lower)
            || OFFER_KEYWORDS.some((kw) => lower.includes(kw));
        return bankOffer
            ? { follow: true, reason: 'bank:offer-path' }
            : { follow: false, reason: 'bank:non-offer-path' };
    }

    // Merchant / generic: require offer keyword
    const hasKeyword = OFFER_KEYWORDS.some((kw) => lower.includes(kw));
    return hasKeyword
        ? { follow: true, reason: 'generic:offer-keyword' }
        : { follow: false, reason: 'generic:no-keyword' };
}

export function buildEnqueueSelector(sourceType) {
    if (sourceType === 'emiratesNbd') {
        return 'a[href*="/deals/"]';
    }
    if (sourceType === 'visaUAE') {
        return 'a[href*="/visa-offers-and-perks/"]';
    }
    if (sourceType === 'fab') {
        return 'a[href*="offer"], a[href*="promo"]';
    }
    if (sourceType === 'hsbc') {
        return 'a[href*="/special-offers/"]';
    }
    if (sourceType === 'mashreq') {
        return 'a[href*="/neo/offers/"], a[href*="/offers/"]';
    }
    if (isCouponSourceType(sourceType)) {
        return 'a[href*="coupon"], a[href*="deal"], a[href*="promo"], a[href*="offer"], a[href*="store"]';
    }
    if (isBankOfferSourceType(sourceType)) {
        return 'a[href*="offer"], a[href*="promo"], a[href*="deal"], a[href*="promotion"]';
    }
    return 'a';
}

export function buildEnqueueExclude(sourceType) {
    const common = [/\/deal-search/i, /\/login/i, /\/sign-?in/i];
    if (sourceType === 'emiratesNbd') {
        return [...common, /\/campaigns\//i, /\/deals\/?(?:\?|#|$)/i];
    }
    return common;
}

export function buildEnqueueGlobs(allowedDomains) {
    if (!allowedDomains || allowedDomains.length === 0) return undefined;
    const globs = [];
    for (const domain of allowedDomains) {
        const bare = domain.replace(/^\*\./, '');
        globs.push(`https://*.${bare}/**`, `http://*.${bare}/**`, `https://${bare}/**`, `http://${bare}/**`);
    }
    return globs;
}

export function urlNeedsBrowser(url, sourceType) {
    const lower = url.toLowerCase();
    // Known JS-rendered listing pages
    if (lower.includes('emiratesnbd.com') && (lower.includes('/deals') || lower.includes('/promotions'))) {
        return true;
    }
    if (lower.includes('visamiddleeast.com') || (lower.includes('visa.co.ae') && lower.includes('/offers'))
        || lower.includes('visa-offers-and-perks')) {
        return true;
    }
    if (sourceType === 'emiratesNbd' || sourceType === 'visaUAE') {
        return true;
    }
    return false;
}

export function looksLikeJsShell(rawText, rawHtml) {
    const textLen = (rawText || '').replace(/\s+/g, ' ').trim().length;
    const htmlLen = (rawHtml || '').length;
    const hasLazyLoad = /lazy-component|ajaxrender|react-root|__NEXT_DATA__|ng-app/i.test(rawHtml || '');
    const hasOops = /oops|page not found|can't seem to find/i.test(rawText || '');
    const sparseContent = textLen < 800 && htmlLen > 5000;
    return hasLazyLoad || hasOops || sparseContent;
}
