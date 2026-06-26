import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../src/shared/utils/url-normalize.js';
import { buildCanonicalKey, buildSnapshotHash } from '../src/shared/utils/hash.js';
import { normalizeRawOffer } from '../src/modules/ingestion/normalization.service.js';
import { scoreOfferConfidence, isCategoryHeader } from '../src/modules/ingestion/confidence-score.service.js';
import { passesQualityGate } from '../src/modules/ingestion/quality-gate.service.js';
import { areLikelyDuplicates, pickPreferredOffer, generateCanonicalKey } from '../src/modules/ingestion/dedupe.service.js';
import { resolveFreshnessStatus, isValidNow, shouldRouteToQuarantine } from '../src/modules/ingestion/freshness.service.js';
import { routeIngestionRecord, routeInvalidSchema } from '../src/modules/ingestion/quarantine.service.js';
import { validateOfferQuery, validateQuarantineQuery } from '../src/shared/schemas/offer.schema.js';

describe('URL normalization', () => {
    it('strips tracking params and lowercases host', () => {
        const url = 'https://www.EmiratesNBD.com/en/deals?utm_source=google&gclid=abc#section';
        assert.equal(
            normalizeUrl(url),
            'https://www.emiratesnbd.com/en/deals',
        );
    });

    it('preserves non-tracking query params', () => {
        const url = 'https://www.emiratesnbd.com/en/deals?seasonality_tags=buy-1-get-1&utm_campaign=x';
        assert.equal(
            normalizeUrl(url),
            'https://www.emiratesnbd.com/en/deals?seasonality_tags=buy-1-get-1',
        );
    });
});

describe('Canonical key generation', () => {
    it('is stable for same normalized offer', () => {
        const offer = {
            normalizedUrl: 'https://www.emiratesnbd.com/en/deals/foo',
            merchantName: 'Ferrari World',
            bankName: 'Emirates NBD',
            offerTitle: '20% off',
            couponCode: null,
            discountType: 'percent',
            discountValue: 20,
        };
        const a = buildCanonicalKey(offer);
        const b = generateCanonicalKey(offer);
        assert.equal(a, b);
        assert.equal(a.length, 64);
    });
});

describe('Normalization', () => {
    it('preserves EMI string values', () => {
        const normalized = normalizeRawOffer({
            sourceUrl: 'https://www.emiratesnbd.com/en/deals/emirates-airline',
            sourceType: 'emiratesNbd',
            offerTitle: 'Emirates Airline',
            discountType: 'emi',
            discountValue: '6 months',
        });
        assert.equal(normalized.discountType, 'emi');
        assert.equal(normalized.discountValue, '6 months');
    });
});

describe('Confidence scoring', () => {
    it('scores detail ENBD offers higher than category headers', () => {
        const detail = normalizeRawOffer({
            sourceUrl: 'https://www.emiratesnbd.com/en/deals/good-times/ferrari-world-yas-island',
            sourceType: 'emiratesNbd',
            offerTitle: 'Ferrari World Yas Island',
            offerDescription: '20% OFF on tickets. Valid until 31/03/2027.',
            discountType: 'percent',
            discountValue: 20,
            merchantName: 'Ferrari World Yas Island',
            crawlDepth: 1,
            pageLength: 18000,
            confidence: 0.77,
        });
        const category = normalizeRawOffer({
            sourceUrl: 'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers',
            sourceType: 'fab',
            offerTitle: 'Food & Drink Offers',
            crawlDepth: 1,
            pageLength: 2500,
            confidence: 0.25,
        });

        const detailScore = scoreOfferConfidence(detail);
        const categoryScore = scoreOfferConfidence(category);
        assert.ok(detailScore > categoryScore);
        assert.ok(isCategoryHeader(category));
    });

    it('penalizes generic Visa detail titles', () => {
        const visaDetail = normalizeRawOffer({
            sourceUrl: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/avis/161598',
            sourceType: 'visaUAE',
            offerTitle: 'Cards & Rewards',
            crawlDepth: 1,
            pageLength: 3000,
        });
        const visaListing = normalizeRawOffer({
            sourceUrl: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/avis/161598',
            sourceType: 'visaUAE',
            offerTitle: 'Avis',
            offerDescription: 'Up to 35% discount with Avis',
            discountType: 'percent',
            discountValue: 35,
            merchantName: 'Avis',
            crawlDepth: 0,
            pageLength: 6000,
        });
        assert.ok(scoreOfferConfidence(visaListing) > scoreOfferConfidence(visaDetail));
    });
});

describe('Quality gate', () => {
    it('rejects shell and garbage pages', () => {
        const result = passesQualityGate(normalizeRawOffer({
            sourceUrl: 'https://ae.visamiddleeast.com/en_AE/pay-with-visa/promotions/uae-offers.html',
            sourceType: 'visaUAE',
            offerTitle: 'Explore Offers',
            rawText: 'Try one of these popular Visa pages instead',
            pageLength: 100,
        }));
        assert.equal(result.passed, false);
        assert.ok(result.reasons.includes('visa_shell_page'));
    });

    it('accepts meaningful merchant offers', () => {
        const result = passesQualityGate(normalizeRawOffer({
            sourceUrl: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/avis/161598',
            sourceType: 'visaUAE',
            offerTitle: 'Avis',
            merchantName: 'Avis',
            discountType: 'percent',
            discountValue: 35,
            pageLength: 6000,
        }));
        assert.equal(result.passed, true);
    });
});

describe('Deduplication', () => {
    it('detects duplicates by canonical fields', () => {
        const a = {
            normalizedUrl: 'https://www.emiratesnbd.com/en/deals/foo',
            offerTitle: 'Ferrari World',
            couponCode: null,
            merchantName: 'Ferrari World',
            bankName: 'Emirates NBD',
        };
        const b = { ...a, sourceUrl: 'https://www.emiratesnbd.com/en/deals/foo?utm=1' };
        assert.ok(areLikelyDuplicates(a, b));
    });

    it('prefers higher-confidence competing rows', () => {
        const existing = { confidence: 0.5, offerTitle: 'A', merchantName: 'A' };
        const incoming = { confidence: 0.8, offerTitle: 'A', merchantName: 'A', discountValue: 20 };
        const picked = pickPreferredOffer(existing, incoming);
        assert.equal(picked.confidence, 0.8);
    });
});

describe('Freshness', () => {
    it('canonical freshness is fresh when above floor', () => {
        assert.equal(resolveFreshnessStatus(0.55, 0.4), 'fresh');
        assert.equal(resolveFreshnessStatus(0.25, 0.4), 'stale');
    });

    it('routes low confidence to quarantine check', () => {
        assert.equal(shouldRouteToQuarantine(0.25, 0.4), true);
        assert.equal(shouldRouteToQuarantine(0.55, 0.4), false);
    });

    it('validNow respects validTo', () => {
        const future = new Date();
        future.setFullYear(future.getFullYear() + 1);
        assert.equal(isValidNow({ validTo: future.toISOString().split('T')[0] }), true);
        assert.equal(isValidNow({ validTo: '2020-01-01' }), false);
    });
});

describe('Quarantine routing', () => {
    it('routes quality gate failures to quarantine', () => {
        const normalized = normalizeRawOffer({
            sourceUrl: 'https://ae.visamiddleeast.com/en_AE/pay-with-visa/promotions/uae-offers.html',
            sourceType: 'visaUAE',
            offerTitle: 'Explore Offers',
            rawText: 'Try one of these popular Visa pages instead',
            pageLength: 100,
        });
        const gate = passesQualityGate(normalized);
        const confidence = scoreOfferConfidence(normalized);
        const routing = routeIngestionRecord({ gate, confidence, confidenceFloor: 0.4 });
        assert.equal(routing.destination, 'quarantine');
        assert.ok(routing.reasons.includes('visa_shell_page'));
    });

    it('routes low-confidence category headers to quarantine', () => {
        const normalized = normalizeRawOffer({
            sourceUrl: 'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers',
            sourceType: 'fab',
            offerTitle: 'Food & Drink Offers',
            crawlDepth: 1,
            pageLength: 2500,
        });
        const gate = passesQualityGate(normalized);
        const confidence = scoreOfferConfidence(normalized);
        const routing = routeIngestionRecord({ gate, confidence, confidenceFloor: 0.4 });
        assert.equal(routing.destination, 'quarantine');
        assert.ok(routing.reasons.includes('below_confidence_floor')
            || routing.reasons.includes('category_header')
            || routing.reasons.includes('bank_missing_checkout_signal'));
    });

    it('accepts high-confidence offers into canonical path', () => {
        const normalized = normalizeRawOffer({
            sourceUrl: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/avis/161598',
            sourceType: 'visaUAE',
            offerTitle: 'Avis',
            merchantName: 'Avis',
            discountType: 'percent',
            discountValue: 35,
            pageLength: 6000,
        });
        const gate = passesQualityGate(normalized);
        const confidence = scoreOfferConfidence(normalized);
        const routing = routeIngestionRecord({ gate, confidence, confidenceFloor: 0.4 });
        assert.equal(routing.destination, 'offers');
    });

    it('routes invalid schema to quarantine', () => {
        const routing = routeInvalidSchema('missing sourceUrl');
        assert.equal(routing.destination, 'quarantine');
        assert.ok(routing.reasons.includes('invalid_schema'));
    });
});

describe('Snapshots', () => {
    it('changes hash when material fields change', () => {
        const base = {
            offerTitle: 'Avis',
            offerDescription: '35% off',
            discountType: 'percent',
            discountValue: 35,
            validTo: '2027-01-01',
            couponCode: null,
            merchantName: 'Avis',
            minSpend: null,
            capValue: null,
        };
        const changed = { ...base, discountValue: 40 };
        assert.notEqual(buildSnapshotHash(base), buildSnapshotHash(changed));
    });
});

describe('Offer query validation', () => {
    it('parses filters and pagination defaults', () => {
        const q = validateOfferQuery({ merchant: 'Avis', page: '2', limit: '10' });
        assert.equal(q.merchant, 'Avis');
        assert.equal(q.page, 2);
        assert.equal(q.limit, 10);
        assert.equal(q.sort, 'updatedAt');
    });

    it('parses confidence range filters', () => {
        const q = validateOfferQuery({ confidenceMin: '0.5', confidenceMax: '0.9' });
        assert.equal(q.confidenceMin, 0.5);
        assert.equal(q.confidenceMax, 0.9);
    });
});

describe('Quarantine query validation', () => {
    it('parses quarantine list filters', () => {
        const q = validateQuarantineQuery({ sourceType: 'fab', confidenceMax: '0.4' });
        assert.equal(q.sourceType, 'fab');
        assert.equal(q.confidenceMax, 0.4);
    });
});
