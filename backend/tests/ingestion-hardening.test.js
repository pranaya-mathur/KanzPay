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

describe('Strict bank quality gate', () => {
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

    it('rejects ADCB nav noise for bank sources', () => {
        const offer = {
            sourceType: 'adcb',
            offerTitle: 'TouchPoints Max',
            merchantName: 'adcb logo Facebook Instagram',
            offerDescription: 'Refer your friends',
            confidence: 0.9,
            pageLength: 500,
        };
        const result = passesQualityGate(offer);
        assert.equal(result.passed, false);
        assert.ok(result.reasons.includes('adcb_nav_noise'));
    });

    it('requires merchant+discount or validTo for tier A banks', () => {
        const weak = {
            sourceType: 'mashreq',
            offerTitle: 'Offers page',
            merchantName: 'Shop',
            confidence: 0.7,
            pageLength: 800,
        };
        const result = passesQualityGate(weak);
        assert.equal(result.passed, false);
        assert.ok(result.reasons.includes('bank_missing_checkout_signal'));
    });

    it('accepts Mashreq EPP merchant listings tagged instalment_plan', () => {
        const epp = {
            sourceType: 'mashreq',
            offerTitle: 'Antoine Saliba World of Jewelry',
            merchantName: 'Antoine Saliba World of Jewelry',
            discountType: 'percent',
            categories: ['instalment_plan'],
            confidence: 0.7,
            pageLength: 800,
        };
        const result = passesQualityGate(epp);
        assert.equal(result.passed, true);
    });

    it('accepts ADCB foreign-currency cashback in title', () => {
        const offer = {
            sourceType: 'adcb',
            offerTitle: 'EUR 8 cashback using Mastercard at PABBLO',
            merchantName: 'By Mastercard',
            discountType: 'cashback',
            confidence: 0.62,
            pageLength: 500,
        };
        const result = passesQualityGate(offer);
        assert.equal(result.passed, true);
    });

    it('accepts 0% interest payment plan offers', () => {
        const offer = {
            sourceType: 'adcb',
            offerTitle: '0% Interest Payment Plan for 6 months at Farah Jewellery',
            merchantName: 'By Farah Jewellery',
            discountType: 'percent',
            confidence: 0.57,
            pageLength: 500,
        };
        const result = passesQualityGate(offer);
        assert.equal(result.passed, true);
    });

    it('continues ingest for approved locked FAB source (not rejected_source quarantine)', () => {
        const offer = {
            sourceUrl: 'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers/foo',
            sourceType: 'fab',
            merchantName: 'Noon',
            offerTitle: '20% off at Noon',
            discountType: 'percent',
            discountValue: 20,
            parserName: 'fabParser',
            confidence: 0.7,
        };
        const registrySource = { status: 'approved', statusLocked: true, sourceType: 'fab' };
        const result = evaluateDiscoveryPolicy(offer, registrySource, new Map(), { confidence: 0.7 });
        assert.equal(result.action, 'continue');
    });
});

describe('Source index priority', () => {
    it('is exported as async function', () => {
        assert.equal(typeof buildSourceIndex, 'function');
    });
});
