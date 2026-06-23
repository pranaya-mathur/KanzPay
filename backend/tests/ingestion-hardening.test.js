import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoveryIndex, attachDiscoveryMetadata } from '../src/modules/ingestion/source-mapper.service.js';
import { evaluateDiscoveryPolicy, DISCOVERY_AUTO_CONFIDENCE } from '../src/modules/ingestion/discovery-policy.service.js';
import { passesQualityGate } from '../src/modules/ingestion/quality-gate.service.js';
import { buildSourceIndex } from '../src/modules/ingestion/source-index.service.js';
import { QUARANTINE_TYPES } from '../src/modules/ingestion/quarantine.service.js';

describe('Discovery index URL normalization', () => {
    it('matches discovery metadata across tracking params', () => {
        const index = buildDiscoveryIndex([{
            url: 'https://www.emiratesnbd.com/en/deals?utm_source=google',
            discoveryQuery: 'ENBD deals',
            serpRank: 2,
        }]);
        const attached = attachDiscoveryMetadata({
            sourceUrl: 'https://www.emiratesnbd.com/en/deals',
            sourceType: 'emiratesNbd',
        }, index);
        assert.equal(attached.discoveryQuery, 'ENBD deals');
        assert.equal(attached.serpRank, 2);
        assert.equal(attached.fromDiscovery, true);
    });
});

describe('Hybrid discovery policy', () => {
    const strongOffer = {
        sourceUrl: 'https://www.noon.com/uae-en/promo/bank-offer',
        sourceType: 'merchant',
        merchantName: 'Noon',
        offerTitle: '10% off',
        discountType: 'percent',
        discountValue: 10,
        parserName: 'merchantParser',
        confidence: 0.75,
        discoveryQuery: 'Noon bank offer UAE',
    };

    it('auto-accepts strong discovery offers from unknown registry', () => {
        const result = evaluateDiscoveryPolicy(strongOffer, null, new Map(), { confidence: 0.75 });
        assert.equal(result.action, 'continue');
        assert.equal(result.discoveryAutoAccepted, true);
    });

    it('quarantines weak generic discovery offers', () => {
        const weak = {
            sourceUrl: 'https://example.com/offers',
            sourceType: 'generic',
            offerTitle: 'Offers page',
            confidence: 0.3,
            discoveryQuery: 'UAE offers',
        };
        const result = evaluateDiscoveryPolicy(weak, null, new Map(), { confidence: 0.3 });
        assert.equal(result.action, 'quarantine');
        assert.equal(result.quarantineType, QUARANTINE_TYPES.DISCOVERY_REVIEW);
    });

    it('uses discovery auto confidence threshold', () => {
        assert.ok(DISCOVERY_AUTO_CONFIDENCE >= 0.6);
    });
});

describe('Strict quality gate', () => {
    it('fails probation-style offers without merchant and value when strict', () => {
        const offer = {
            offerTitle: 'Some offer page',
            offerDescription: 'Marketing text only',
            confidence: 0.4,
            pageLength: 500,
        };
        const loose = passesQualityGate(offer);
        const strict = passesQualityGate(offer, { strictGate: true });
        assert.equal(loose.passed, true);
        assert.equal(strict.passed, false);
        assert.ok(strict.reasons.includes('strict_missing_merchant_and_value'));
    });
});

describe('Source index priority', () => {
    it('is exported as async function', () => {
        assert.equal(typeof buildSourceIndex, 'function');
    });
});
