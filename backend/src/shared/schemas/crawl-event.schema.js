import { z } from 'zod';

export const CrawlEventSchema = z.object({
    runId: z.string().uuid(),
    sourceUrl: z.string(),
    sourceType: z.string(),
    parserName: z.string().nullable().optional(),
    parserReason: z.string().nullable().optional(),
    rawHtml: z.string().nullable().optional(),
    rawText: z.string().nullable().optional(),
    scrapedAt: z.string().nullable().optional(),
    pageLength: z.number().optional(),
    discoveryQuery: z.string().nullable().optional(),
    discoverySource: z.string().nullable().optional(),
    serpRank: z.number().nullable().optional(),
    payloadJson: z.record(z.unknown()),
});

export const IngestionRunSchema = z.object({
    id: z.string().uuid(),
    runType: z.string(),
    inputJson: z.record(z.unknown()),
    statsJson: z.record(z.unknown()),
    startedAt: z.string(),
    finishedAt: z.string().nullable().optional(),
    status: z.enum(['running', 'completed', 'failed']),
    errorMessage: z.string().nullable().optional(),
});
