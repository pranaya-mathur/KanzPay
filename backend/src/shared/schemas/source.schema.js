import { z } from 'zod';

export const SOURCE_STATUSES = ['approved', 'probation', 'rejected'];
export const SOURCE_CATEGORIES = ['bank', 'network', 'merchant', 'coupon', 'discovery', 'generic'];

export const SOURCE_RELIABILITY = {
    // Core banks
    emiratesNbd: 0.90,
    visaUAE:     0.85,
    fab:         0.80,
    // New UAE banks
    adcb:        0.82,
    mashreq:     0.80,
    rakBank:     0.78,
    dib:         0.76,
    hsbc:        0.80,
    citibank:    0.78,
    cbd:         0.75,
    adib:        0.82,
    scb:         0.70,
    // Coupon aggregators
    groupon:     0.70,
    cuponation:  0.68,
    picodi:      0.65,
    couponsAe:   0.65,
    wethrift:    0.62,
    // Loyalty / deal platforms
    smiles:      0.72,
    noon:        0.68,
    // Generic
    couponFeed:  0.65,
    merchant:    0.70,
    discovery:   0.20,
    generic:     0.50,
};

export const STATUS_CONFIDENCE_MULTIPLIER = {
    approved: 1.0,
    probation: 0.85,
    rejected: 0.5,
};

export const STATUS_CONFIDENCE_FLOOR_OVERRIDE = {
    approved: null,
    probation: 0.45,
    rejected: 0.99,
};

/** Shared profile for all bankOfferParser-backed sources */
const BANK_OFFER_PROFILE_BASE = {
    parserName: 'bankOfferParser',
    crawlerMode: 'playwright',
    maxDepth: 1,
    confidenceFloor: 0.45,
    strictQualityGate: true,
};

/** Shared profile for couponFeed-backed aggregator sources */
const COUPON_FEED_PROFILE_BASE = {
    parserName: 'couponFeedParser',
    crawlerMode: 'cheerio',
    maxDepth: 1,
    confidenceFloor: 0.4,
};

export const PARSER_PROFILES = {
    // ── Existing ──────────────────────────────────────────────────────────────
    emiratesNbd: {
        parserName: 'emiratesNbdParser',
        crawlerMode: 'playwright',
        maxDepth: 2,
        maxRequestsBudget: 40,
        confidenceFloor: 0.55,
        strictQualityGate: true,
        enqueueSelector: 'a[href*="/deals/"]',
        waitSelector: 'a[href*="/deals/"], .deal-info',
    },
    visaUAE: {
        parserName: 'visaUAEParser',
        crawlerMode: 'playwright',
        maxDepth: 1,
        maxRequestsBudget: 30,
        confidenceFloor: 0.45,
        waitSelector: '.vs-card, .vs-cards-container',
        enqueueSelector: 'a[href*="/visa-offers-and-perks/"]',
        strictQualityGate: true,
    },
    fab: {
        parserName: 'fabParser',
        crawlerMode: 'playwright',
        maxDepth: 2,
        maxRequestsBudget: 50,
        confidenceFloor: 0.55,
        strictQualityGate: true,
        categoryHeaderPenalty: true,
    },
    couponFeed:  { ...COUPON_FEED_PROFILE_BASE },
    merchant:    { parserName: 'merchantParser', crawlerMode: 'auto', maxDepth: 1, confidenceFloor: 0.4 },
    discovery:   { discoveryOnly: true, autoCrawl: false },
    generic:     { parserName: 'genericParser', crawlerMode: 'auto', maxDepth: 0, confidenceFloor: 0.5 },

    // ── New UAE banks (all use bankOfferParser) ───────────────────────────────
    adcb:      { parserName: 'adcbParser', crawlerMode: 'playwright', maxDepth: 2, maxRequestsBudget: 60, confidenceFloor: 0.55, strictQualityGate: true, waitSelector: '.offer-card, .promo-card, article' },
    mashreq:   { parserName: 'mashreqParser', crawlerMode: 'playwright', maxDepth: 2, maxRequestsBudget: 50, confidenceFloor: 0.55, strictQualityGate: true, waitSelector: 'a[href*="/neo/offers/"], main' },
    rakBank:   { parserName: 'rakbankParser', crawlerMode: 'playwright', maxDepth: 2, maxRequestsBudget: 25, confidenceFloor: 0.45, strictQualityGate: true, waitSelector: '.offer-card, .card-offer, article' },
    dib:       { parserName: 'dibParser', crawlerMode: 'playwright', maxDepth: 2, maxRequestsBudget: 30, confidenceFloor: 0.55, strictQualityGate: true, waitSelector: '.offer, .promotion, article' },
    adib:      { parserName: 'adibParser', crawlerMode: 'playwright', maxDepth: 2, maxRequestsBudget: 25, confidenceFloor: 0.55, strictQualityGate: true, waitSelector: '.offer, .promotion, article' },
    hsbc:      { parserName: 'hsbcParser', crawlerMode: 'playwright', maxDepth: 2, maxRequestsBudget: 20, confidenceFloor: 0.45, strictQualityGate: true, waitSelector: '.offer-card, .promo-card, article' },
    citibank:  { ...BANK_OFFER_PROFILE_BASE, autoCrawl: false, waitSelector: '.offer-card, .promo-item, article' },
    cbd:       { parserName: 'cbdParser', crawlerMode: 'playwright', maxDepth: 2, maxRequestsBudget: 15, confidenceFloor: 0.45, strictQualityGate: true, waitSelector: '.offer-card, .deal-card, article' },
    mastercard:{ ...BANK_OFFER_PROFILE_BASE, waitSelector: '.promotion-card, .offer-card, article' },

    // ── Coupon aggregators (all use couponFeedParser) ─────────────────────────
    groupon:    { ...COUPON_FEED_PROFILE_BASE },
    cuponation: { ...COUPON_FEED_PROFILE_BASE },
    picodi:     { ...COUPON_FEED_PROFILE_BASE },
    couponsAe:  { ...COUPON_FEED_PROFILE_BASE },
    wethrift:   { ...COUPON_FEED_PROFILE_BASE },

    // ── Loyalty / deals ───────────────────────────────────────────────────────
    smiles: { ...COUPON_FEED_PROFILE_BASE, crawlerMode: 'playwright' },
    noon:   { ...COUPON_FEED_PROFILE_BASE, crawlerMode: 'playwright' },
};

export const SOURCE_STALE_DAYS_DEFAULT = 14;

export function getSourceReliability(sourceType) {
    return SOURCE_RELIABILITY[sourceType] ?? 0.5;
}

export function getStatusMultiplier(status) {
    return STATUS_CONFIDENCE_MULTIPLIER[status] ?? 0.85;
}

export function mapSourceTypeFromUrl(url) {
    const lower = (url || '').toLowerCase();
    // Banks
    if (lower.includes('emiratesnbd.com'))                              return 'emiratesNbd';
    if (lower.includes('bankfab.com'))                                  return 'fab';
    if (lower.includes('adcb.com'))                                     return 'adcb';
    if (lower.includes('mashreq.com'))                                  return 'mashreq';
    if (lower.includes('rakbank.ae'))                                   return 'rakBank';
    if (/\bdib\.ae\b/.test(lower))                                      return 'dib';
    if (lower.includes('hsbc.ae'))                                      return 'hsbc';
    if (lower.includes('citibank.ae'))                                  return 'citibank';
    if (/\bcbd\.ae\b/.test(lower))                                      return 'cbd';
    // Card networks
    if (lower.includes('visamiddleeast.com') || lower.includes('visa.co.ae')) return 'visaUAE';
    if (/mastercard\.(ae|com)/.test(lower))                             return 'mastercard';
    // Coupon aggregators
    if (lower.includes('groupon.ae'))                                   return 'groupon';
    if (lower.includes('cuponation.ae'))                                return 'cuponation';
    if (lower.includes('picodi.com/ae'))                                return 'picodi';
    if (lower.includes('coupons.ae'))                                   return 'couponsAe';
    if (lower.includes('wethrift.com'))                                 return 'wethrift';
    // Loyalty / deal platforms
    if (lower.includes('smiles.ae'))                                    return 'smiles';
    if (lower.includes('noon.com') && /offer|deal|coupon/i.test(lower)) return 'noon';
    // Generic coupon paths
    if (/coupon|promo-code|voucher/i.test(lower))                       return 'couponFeed';
    // Discovery
    if (lower.includes('google.com') && lower.includes('/search'))      return 'discovery';
    return 'generic';
}

export function inferCategory(sourceType) {
    const map = {
        emiratesNbd: 'bank',
        fab:         'bank',
        adcb:        'bank',
        mashreq:     'bank',
        rakBank:     'bank',
        dib:         'bank',
        hsbc:        'bank',
        citibank:    'bank',
        cbd:         'bank',
        visaUAE:     'network',
        adib:        'bank',
    scb:         'bank',
    mastercard:  'network',
        groupon:     'coupon',
        cuponation:  'coupon',
        picodi:      'coupon',
        couponsAe:   'coupon',
        wethrift:    'coupon',
        couponFeed:  'coupon',
        smiles:      'coupon',
        noon:        'merchant',
        merchant:    'merchant',
        discovery:   'discovery',
    };
    return map[sourceType] || 'generic';
}

export const SourceRecordSchema = z.object({
    sourceName: z.string().min(2),
    domain: z.string().min(3),
    baseUrl: z.string().url(),
    sourceType: z.string(),
    category: z.enum(SOURCE_CATEGORIES).optional(),
    status: z.enum(SOURCE_STATUSES).optional(),
    priority: z.number().int().optional(),
    parserProfileJson: z.record(z.unknown()).optional(),
    crawlRulesJson: z.record(z.unknown()).optional(),
});

export const SourceQuerySchema = z.object({
    status: z.enum(SOURCE_STATUSES).optional(),
    sourceType: z.string().optional(),
    category: z.string().optional(),
    confidenceMin: z.coerce.number().min(0).max(1).optional(),
    confidenceMax: z.coerce.number().min(0).max(1).optional(),
    domain: z.string().optional(),
    sort: z.enum(['confidence', 'priority', 'lastCrawledAt', 'sampleSize', 'updatedAt']).optional().default('priority'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const SourceStatusUpdateSchema = z.object({
    status: z.enum(SOURCE_STATUSES),
    reason: z.string().optional(),
});

export const SourceValidateSchema = z.object({
    sourceId: z.string().uuid().optional(),
    domain: z.string().optional(),
    sourceType: z.string().optional(),
    recomputeAll: z.boolean().optional().default(false),
});

export function validateSourceQuery(query) {
    return SourceQuerySchema.parse(query);
}

export function validateSourceRecord(body) {
    return SourceRecordSchema.parse(body);
}

export function validateStatusUpdate(body) {
    return SourceStatusUpdateSchema.parse(body);
}

export function validateSourceValidate(body) {
    return SourceValidateSchema.parse(body);
}

export function getParserProfile(sourceType, storedProfile = {}) {
    const defaults = PARSER_PROFILES[sourceType] || PARSER_PROFILES.generic;
    return { ...defaults, ...storedProfile };
}
