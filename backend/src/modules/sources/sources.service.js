import { query } from '../../db/pool.js';
import * as repo from './sources.repository.js';
import {
    validateSourceQuery, validateStatusUpdate, validateSourceValidate,
    inferCategory, getParserProfile, PARSER_PROFILES,
} from '../../shared/schemas/source.schema.js';
import { extractDomain, buildBaseUrl } from '../../shared/utils/domain-normalize.js';
import { mapSourceTypeFromUrl } from '../../shared/schemas/source.schema.js';
import {
    computeSourceScore, aggregateOfferMetrics,
    computeQuarantineRate, computeParseSuccessRate,
} from './source-score.service.js';
import { classifySourceStatus, getStatusRecommendation } from './source-classifier.service.js';
import { getCrawlConstraints } from './source-policy.service.js';
import logger from '../../shared/utils/logger.js';

function offersToMetrics(offers, quarantineCount) {
    const agg = aggregateOfferMetrics(offers);
    const total = offers.length + quarantineCount;
    return {
        ...agg,
        quarantineRate: computeQuarantineRate(quarantineCount, total),
        parseSuccessRate: computeParseSuccessRate(offers.length, total),
        failureRate: total ? quarantineCount / total : 0,
        quarantineCount,
    };
}

export async function listSources(query) {
    return repo.findSources(validateSourceQuery(query));
}

export async function getSource(id) {
    return repo.findSourceById(id);
}

export async function listByStatus(status) {
    return repo.findSourcesByStatus(status);
}

export async function resolveSourceForUrl(url) {
    let source = await repo.findSourceForUrl(url);
    if (source) return source;

    const domain = extractDomain(url);
    const sourceType = mapSourceTypeFromUrl(url);
    if (!domain) return null;

    return repo.upsertSource({
        sourceName: `${sourceType} @ ${domain}`,
        domain,
        baseUrl: buildBaseUrl(url),
        sourceType,
        category: inferCategory(sourceType),
        status: 'probation',
        parserProfileJson: getParserProfile(sourceType),
        crawlRulesJson: { autoCrawl: false },
    });
}

export async function validateSource(input = {}) {
    const opts = validateSourceValidate(input);

    if (opts.recomputeAll) {
        const { data } = await repo.findSources({ limit: 100, page: 1 });
        const results = [];
        for (const source of data) {
            results.push(await validateSingleSource(source.id));
        }
        return { validated: results.length, results };
    }

    if (opts.sourceId) {
        return validateSingleSource(opts.sourceId);
    }

    if (opts.domain && opts.sourceType) {
        const source = await repo.findSourceByDomainAndType(opts.domain, opts.sourceType);
        if (!source) throw new Error(`Source not found: ${opts.domain} / ${opts.sourceType}`);
        return validateSingleSource(source.id);
    }

    throw new Error('Provide sourceId, domain+sourceType, or recomputeAll=true');
}

export async function validateSingleSource(sourceId) {
    const source = await repo.findSourceById(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);

    const run = await repo.createSourceRun(sourceId, 'validation');

    try {
        await repo.linkOffersToSource(sourceId, source.sourceType, source.domain);

        const offerRows = await repo.getOffersForSource(sourceId);
        const offers = offerRows.map((r) => ({
            merchantName: r.merchant_name,
            discountType: r.discount_type,
            discountValue: r.discount_value,
            validTo: r.valid_to,
            offerDescription: r.offer_description,
            bankName: r.bank_name,
            cardName: r.card_name,
            confidence: Number(r.confidence),
            freshnessStatus: r.freshness_status,
        }));

        const quarantineCount = await repo.getQuarantineStatsForSource(sourceId);
        const metrics = offersToMetrics(offers, quarantineCount);
        metrics.sourceType = source.sourceType;

        const score = computeSourceScore({
            avgOfferConfidence: metrics.avgOfferConfidence,
            avgFieldCompleteness: metrics.avgFieldCompleteness,
            avgParseSuccessRate: metrics.parseSuccessRate,
            avgMerchantYield: metrics.avgMerchantYield,
            avgFreshnessScore: metrics.avgFreshnessScore,
            quarantineRate: metrics.quarantineRate,
            failureRate: metrics.failureRate,
            sampleSize: metrics.sampleSize,
        });

        const classification = classifySourceStatus(score, metrics, source.status);

        await repo.insertObservation(sourceId, run.id, 'validation', 'source_score', score, metrics);
        await repo.finishSourceRun(run.id, 'completed', { ...metrics, classification }, score);

        const updated = await repo.updateSourceMetrics(sourceId, {
            score,
            avgOfferConfidence: metrics.avgOfferConfidence,
            avgFieldCompleteness: metrics.avgFieldCompleteness,
            avgParseSuccessRate: metrics.parseSuccessRate,
            avgMerchantYield: metrics.avgMerchantYield,
            avgFreshnessScore: metrics.avgFreshnessScore,
            sampleSize: metrics.sampleSize,
            quarantineCount,
        }, classification, { statusLocked: source.statusLocked });

        logger.info('Source validated', {
            sourceId, score,
            status: source.statusLocked ? source.status : classification.status,
            statusLocked: source.statusLocked,
        });

        return {
            source: updated,
            score,
            classification,
            metrics,
            runId: run.id,
        };
    } catch (err) {
        await repo.finishSourceRun(run.id, 'failed', {}, null, err.message);
        await repo.insertFailure(sourceId, run.id, 'validation_error', err.message, source.baseUrl);
        throw err;
    }
}

export async function setSourceStatus(id, body) {
    const { status, reason } = validateStatusUpdate(body);
    const updated = await repo.updateSourceStatus(id, status, reason);
    if (!updated) throw new Error(`Source not found: ${id}`);
    return updated;
}

export async function getSourceHealth(id) {
    const source = await repo.findSourceById(id);
    if (!source) return null;

    const quarantineCount = await repo.getQuarantineStatsForSource(id);
    const total = source.sampleSize + quarantineCount;
    const failures = await repo.getRecentFailures(id);

    return {
        sourceId: source.id,
        sourceName: source.sourceName,
        domain: source.domain,
        status: source.status,
        confidence: source.confidence,
        metrics: {
            sampleSize: source.sampleSize,
            avgOfferConfidence: source.avgOfferConfidence,
            avgFieldCompleteness: source.avgFieldCompleteness,
            avgMerchantYield: source.avgMerchantYield,
            quarantineRate: computeQuarantineRate(quarantineCount, total),
            parseSuccessRate: source.avgParseSuccessRate,
            freshnessScore: source.avgFreshnessScore,
            successCount: source.successCount,
            failureCount: source.failureCount,
            quarantineCount,
        },
        recentFailures: failures.map((f) => ({
            type: f.failure_type,
            reason: f.reason,
            sampleUrl: f.sample_url,
            occurredAt: f.occurred_at,
        })),
        parserProfile: getParserProfile(source.sourceType, source.parserProfileJson),
        crawlRules: source.crawlRulesJson,
        crawlConstraints: getCrawlConstraints(source),
        recommendation: getStatusRecommendation(source.status, source.confidence, source),
        lastCrawledAt: source.lastCrawledAt,
        lastPassedAt: source.lastPassedAt,
        lastFailedAt: source.lastFailedAt,
    };
}

export async function getSourceDashboard() {
    const statuses = ['approved', 'probation', 'rejected'];
    const summary = {};
    for (const status of statuses) {
        const sources = await repo.findSourcesByStatus(status);
        summary[status] = {
            count: sources.length,
            sources: sources.map((s) => ({
                id: s.id,
                sourceName: s.sourceName,
                domain: s.domain,
                confidence: s.confidence,
                sampleSize: s.sampleSize,
                lastCrawledAt: s.lastCrawledAt,
            })),
        };
    }

    let lastIngestionRun = null;
    let quarantineSummary = null;
    try {
        const { query } = await import('../../db/pool.js');
        const ingestRes = await query(
            `SELECT id, status, stats_json, finished_at FROM ingestion_runs
             ORDER BY started_at DESC LIMIT 1`,
        );
        if (ingestRes.rows[0]) {
            lastIngestionRun = {
                id: ingestRes.rows[0].id,
                status: ingestRes.rows[0].status,
                stats: ingestRes.rows[0].stats_json,
                finishedAt: ingestRes.rows[0].finished_at,
            };
        }
        const { getQuarantineStats } = await import('../quarantine/quarantine.repository.js');
        quarantineSummary = await getQuarantineStats();
    } catch {
        // DB optional in some environments
    }

    return {
        ...summary,
        lastIngestionRun,
        quarantineSummary,
    };
}

export async function refreshAllSourceHealth() {
    const { data } = await repo.findSources({ limit: 100, page: 1 });
    const results = [];
    for (const source of data) {
        if (source.sourceType === 'discovery') continue;
        try {
            results.push(await validateSingleSource(source.id));
        } catch (err) {
            logger.warn('Source health refresh failed', { sourceId: source.id, error: err.message });
        }
    }
    return { refreshed: results.length, results };
}

export { PARSER_PROFILES };
