import { z } from 'zod';

export const SourceRunSchema = z.object({
    id: z.string().uuid(),
    sourceId: z.string().uuid(),
    runType: z.string(),
    status: z.enum(['running', 'completed', 'failed']),
    statsJson: z.record(z.unknown()),
    score: z.number().nullable().optional(),
    startedAt: z.string(),
    finishedAt: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
});

export const SourceHealthSchema = z.object({
    sourceId: z.string().uuid(),
    status: z.string(),
    confidence: z.number(),
    metrics: z.object({
        sampleSize: z.number(),
        avgOfferConfidence: z.number().nullable(),
        avgFieldCompleteness: z.number().nullable(),
        avgMerchantYield: z.number().nullable(),
        quarantineRate: z.number().nullable(),
        parseSuccessRate: z.number().nullable(),
        freshnessScore: z.number().nullable(),
    }),
    recentFailures: z.array(z.unknown()).optional(),
    parserProfile: z.record(z.unknown()).optional(),
    crawlRules: z.record(z.unknown()).optional(),
    recommendation: z.string().optional(),
});
