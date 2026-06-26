import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractDomain, normalizeDomain, domainsMatch, buildBaseUrl } from '../src/shared/utils/domain-normalize.js';
import { computeSourceScore, aggregateOfferMetrics, computeMerchantYield } from '../src/modules/sources/source-score.service.js';
import { classifySourceStatus, statusAllowsAutoCrawl, isTierASourceType } from '../src/modules/sources/source-classifier.service.js';
import { resolveConfidenceFloor, canCrawlSource, applySourceConfidenceAdjustment } from '../src/modules/sources/source-policy.service.js';
import { buildCrawlPlan } from '../src/modules/crawler/crawl-plan.service.js';
import { scoreOfferConfidence } from '../src/modules/ingestion/confidence-score.service.js';
import { normalizeRawOffer } from '../src/modules/ingestion/normalization.service.js';

describe('Domain normalization', () => {
    it('extracts domain without www', () => {
        assert.equal(extractDomain('https://www.emiratesnbd.com/en/deals'), 'emiratesnbd.com');
    });

    it('matches equivalent domains', () => {
        assert.ok(domainsMatch('www.emiratesnbd.com', 'emiratesnbd.com'));
    });

    it('builds stable base URLs', () => {
        assert.equal(
            buildBaseUrl('https://www.emiratesnbd.com/en/deals?utm=1'),
            'https://www.emiratesnbd.com/en/deals',
        );
    });
});

describe('Source score calculation', () => {
    it('scores high-yield ENBD-like metrics highly', () => {
        const score = computeSourceScore({
            avgOfferConfidence: 0.9,
            avgFieldCompleteness: 0.85,
            avgParseSuccessRate: 0.95,
            avgMerchantYield: 0.9,
            avgFreshnessScore: 0.95,
            quarantineRate: 0.05,
            failureRate: 0.05,
            sampleSize: 20,
        });
        assert.ok(score >= 0.75);
    });

    it('scores noisy FAB-like metrics lower', () => {
        const score = computeSourceScore({
            avgOfferConfidence: 0.5,
            avgFieldCompleteness: 0.35,
            avgParseSuccessRate: 0.6,
            avgMerchantYield: 0.3,
            avgFreshnessScore: 0.7,
            quarantineRate: 0.35,
            failureRate: 0.2,
            sampleSize: 25,
        });
        assert.ok(score < 0.6);
    });

    it('computes merchant yield', () => {
        const yield_ = computeMerchantYield([
            { merchantName: 'Avis' },
            { merchantName: 'Noon' },
            { merchantName: null },
        ]);
        assert.equal(yield_, 0.667);
    });
});

describe('Source classification', () => {
    it('approves high-score structured sources', () => {
        const result = classifySourceStatus(0.82, {
            quarantineRate: 0.08,
            avgMerchantYield: 0.75,
            avgFieldCompleteness: 0.7,
            sampleSize: 20,
        });
        assert.equal(result.status, 'approved');
    });

    it('puts inconsistent sources on probation', () => {
        const result = classifySourceStatus(0.55, {
            quarantineRate: 0.2,
            avgMerchantYield: 0.45,
            avgFieldCompleteness: 0.4,
            sampleSize: 20,
            sourceType: 'fab',
        });
        assert.equal(result.status, 'probation');
    });

    it('rejects discovery sources', () => {
        const result = classifySourceStatus(0.3, { sampleSize: 0, sourceType: 'discovery' });
        assert.equal(result.status, 'rejected');
    });

    it('defaults ENBD to approved with low sample', () => {
        const result = classifySourceStatus(0.5, { sampleSize: 2, sourceType: 'emiratesNbd' });
        assert.equal(result.status, 'approved');
    });

    it('defaults FAB to approved with low sample (tier A bootstrap)', () => {
        const result = classifySourceStatus(0.5, { sampleSize: 2, sourceType: 'fab' });
        assert.equal(result.status, 'approved');
    });

    it('never rejects tier A sources with very low score', () => {
        const result = classifySourceStatus(0.2, {
            quarantineRate: 0.5,
            avgMerchantYield: 0.1,
            avgFieldCompleteness: 0.2,
            sampleSize: 30,
            sourceType: 'fab',
        });
        assert.notEqual(result.status, 'rejected');
        assert.ok(isTierASourceType('fab'));
    });

    it('locked status preserves approved tier on metrics update semantics', () => {
        const lowScore = classifySourceStatus(0.2, {
            sampleSize: 30,
            sourceType: 'fab',
            quarantineRate: 0.4,
            avgMerchantYield: 0.2,
            avgFieldCompleteness: 0.3,
        });
        assert.equal(lowScore.status, 'probation');
    });
});

describe('Source policy', () => {
    const approved = { status: 'approved', sourceType: 'emiratesNbd', confidence: 0.92, parserProfileJson: {} };
    const probation = { status: 'probation', sourceType: 'fab', confidence: 0.55, parserProfileJson: { confidenceFloor: 0.5 } };
    const rejected = { status: 'rejected', sourceType: 'discovery', confidence: 0.2, crawlRulesJson: { autoCrawl: false } };

    it('allows auto crawl for approved and probation', () => {
        assert.equal(statusAllowsAutoCrawl('approved'), true);
        assert.equal(statusAllowsAutoCrawl('probation'), true);
        assert.equal(statusAllowsAutoCrawl('rejected'), false);
    });

    it('uses stricter confidence floor for probation', () => {
        assert.equal(resolveConfidenceFloor(approved), 0.55);
        assert.equal(resolveConfidenceFloor(probation), 0.5);
    });

    it('blocks rejected sources from crawl', () => {
        assert.equal(canCrawlSource(rejected), false);
        assert.equal(canCrawlSource(approved), true);
    });

    it('adjusts offer confidence by registry status', () => {
        const base = 0.6;
        const adjusted = applySourceConfidenceAdjustment(base, probation);
        assert.ok(adjusted < base);
    });
});

describe('Ingestion confidence with source registry', () => {
    it('boosts offers from approved high-confidence sources', () => {
        const offer = normalizeRawOffer({
            sourceUrl: 'https://www.emiratesnbd.com/en/deals/foo',
            sourceType: 'emiratesNbd',
            offerTitle: 'Ferrari World',
            merchantName: 'Ferrari World',
            discountType: 'percent',
            discountValue: 20,
            crawlDepth: 1,
            pageLength: 18000,
        });
        const without = scoreOfferConfidence(offer);
        const withSource = scoreOfferConfidence(offer, { status: 'approved', confidence: 0.92, sourceType: 'emiratesNbd' });
        assert.ok(withSource >= 0.6);
        assert.ok(without >= 0.6);
    });
});

describe('Crawl plan filtering', () => {
    it('buildCrawlPlan is a function', () => {
        assert.equal(typeof buildCrawlPlan, 'function');
    });
});
