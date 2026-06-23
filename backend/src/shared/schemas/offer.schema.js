import { z } from 'zod';

export const SOURCE_TYPES = [
    'emiratesNbd', 'visaUAE', 'fab', 'couponFeed', 'merchant', 'generic',
];

export const DISCOUNT_TYPES = [
    'percent', 'fixed', 'cashback', 'coupon', 'points', 'emi', 'installment', 'complimentary', 'other',
];

export const FRESHNESS_STATUSES = ['fresh', 'stale'];

export const RawCrawlOfferSchema = z.object({
    sourceUrl: z.string().url(),
    sourceType: z.enum(SOURCE_TYPES).or(z.string()),
    bankName: z.string().nullable().optional(),
    cardName: z.string().nullable().optional(),
    merchantName: z.string().nullable().optional(),
    offerTitle: z.string().nullable().optional(),
    offerDescription: z.string().nullable().optional(),
    discountType: z.string().nullable().optional(),
    discountValue: z.union([z.string(), z.number()]).nullable().optional(),
    currency: z.string().nullable().optional(),
    minSpend: z.union([z.string(), z.number()]).nullable().optional(),
    capValue: z.union([z.string(), z.number()]).nullable().optional(),
    validFrom: z.string().nullable().optional(),
    validTo: z.string().nullable().optional(),
    couponCode: z.string().nullable().optional(),
    paymentMethods: z.array(z.string()).optional().default([]),
    eligibleMccList: z.array(z.string()).optional().default([]),
    categories: z.array(z.string()).optional().default([]),
    stackable: z.boolean().optional().default(false),
    termsUrl: z.string().nullable().optional(),
    confidence: z.number().optional(),
    parserName: z.string().nullable().optional(),
    parserReason: z.string().nullable().optional(),
    crawlDepth: z.number().optional().default(0),
    pageLength: z.number().optional().default(0),
    scrapedAt: z.string().optional(),
    rawText: z.string().nullable().optional(),
    rawHtml: z.string().nullable().optional(),
    discoveryQuery: z.string().nullable().optional(),
    discoverySource: z.string().nullable().optional(),
    serpRank: z.number().nullable().optional(),
    fromDiscovery: z.boolean().optional(),
    parserVersion: z.string().nullable().optional(),
    pageType: z.string().nullable().optional(),
    schemaVersion: z.string().optional(),
}).passthrough();

export const IngestionRunInputSchema = z.object({
    crawlDataDir: z.string().optional(),
    discoveryDataPath: z.string().optional(),
    runSummaryPath: z.string().optional(),
    apifyRunId: z.string().optional(),
    crawlRunId: z.string().optional(),
    confidenceFloor: z.number().min(0).max(1).optional(),
    runType: z.enum(['crawl_ingest', 'discovery_ingest']).optional().default('crawl_ingest'),
    dryRun: z.boolean().optional().default(false),
});

export const OfferQuerySchema = z.object({
    sourceType: z.string().optional(),
    merchant: z.string().optional(),
    bank: z.string().optional(),
    card: z.string().optional(),
    couponCode: z.string().optional(),
    category: z.string().optional(),
    validNow: z.coerce.boolean().optional(),
    freshnessStatus: z.enum(FRESHNESS_STATUSES).optional(),
    discoveryQuery: z.string().optional(),
    q: z.string().optional(),
    confidenceMin: z.coerce.number().min(0).max(1).optional(),
    confidenceMax: z.coerce.number().min(0).max(1).optional(),
    sort: z.enum(['updatedAt', 'confidence', 'lastSeenAt']).optional().default('updatedAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export function validateRawCrawlOffer(payload) {
    return RawCrawlOfferSchema.parse(payload);
}

export function validateOfferQuery(query) {
    return OfferQuerySchema.parse(query);
}

export const QuarantineQuerySchema = z.object({
    runId: z.string().uuid().optional(),
    sourceType: z.string().optional(),
    sourceUrl: z.string().optional(),
    discoveryQuery: z.string().optional(),
    confidenceMin: z.coerce.number().min(0).max(1).optional(),
    confidenceMax: z.coerce.number().min(0).max(1).optional(),
    q: z.string().optional(),
    sort: z.enum(['createdAt', 'confidence']).optional().default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export function validateQuarantineQuery(query) {
    return QuarantineQuerySchema.parse(query);
}
