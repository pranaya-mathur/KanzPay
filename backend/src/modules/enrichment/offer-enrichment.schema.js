import { z } from 'zod';

export const ENRICHMENT_FLAGS = [
    'expired',
    'generic_page',
    'not_an_offer',
    'emi_not_discount',
    'missing_dates',
    'missing_terms',
];

export const EvidenceSchema = z.object({
    field: z.string(),
    quote: z.string().min(1),
});

export const OfferEnrichmentResultSchema = z.object({
    valid_from: z.string().nullable().optional(),
    valid_to: z.string().nullable().optional(),
    min_spend: z.number().nullable().optional(),
    cap_value: z.number().nullable().optional(),
    card_name: z.string().nullable().optional(),
    coupon_code: z.string().nullable().optional(),
    terms_url: z.string().nullable().optional(),
    flags: z.array(z.string()).optional().default([]),
    confidence: z.number().min(0).max(1),
    evidence: z.array(EvidenceSchema).optional().default([]),
});

export function parseOfferEnrichmentResult(payload) {
    return OfferEnrichmentResultSchema.parse(payload);
}
