#!/usr/bin/env node
/**
 * Offline parser smoke test — no network required.
 * Usage: npm run test:parsers
 */

import * as cheerio from 'cheerio';
import { routeParser } from '../src/parsers/index.js';
import { normalizeOffer, passesQualityGate } from '../src/schema/offerSchema.js';

const SAMPLES = {
    emiratesNbd: {
        hint: 'emiratesNbd',
        url: 'https://www.emiratesnbd.com/en/deals/good-times/ferrari-world-yas-island',
        html: `<html><body><div class="deal-info">Ferrari World Yas Island
20% OFF on bill. Save 20% on Tickets. Expires on: 31/03/2027. Theme Park.</div></body></html>`,
    },
    visaUAE: {
        hint: 'visaUAE',
        url: 'https://www.visa.co.ae/en_AE/pay-with-visa/offers/dining',
        html: `<html><body><h1>Save 15% on dining</h1><p>Visa cardholders get 15% cashback at UAE restaurants. Valid until 30 June 2026.</p></body></html>`,
    },
    fab: {
        hint: 'fab',
        url: 'https://www.bankfab.com/en-ae/personal/cards/offers/lounge',
        html: `<html><body><h1>Complimentary airport lounge access</h1><p>Up to 5% cashback on retail. Capped at AED 200 monthly. Minimum monthly spend AED 5000.</p></body></html>`,
    },
    couponFeed: {
        hint: 'couponFeed',
        url: 'https://www.uae-coupons.ae/promo-codes/noon',
        html: `<html><body><div class="coupon-item"><span class="store-name">Noon</span><span class="coupon-code">NOON30</span><h3>30% off at Noon</h3><p>Valid until 15 August 2026.</p></div></body></html>`,
    },
    merchant: {
        hint: 'merchant',
        url: 'https://www.noon.com/uae-en/promo/bank-offer',
        html: `<html><body><meta property="og:site_name" content="Noon"/><h1>Emirates NBD card offer</h1><p>10% off for Emirates NBD Visa cardholders. Min cart value AED 200.</p></body></html>`,
    },
};

let passed = 0;
for (const [name, sample] of Object.entries(SAMPLES)) {
    const $ = cheerio.load(sample.html);
    const rawText = $('body').text();
    const { parserId, offers } = routeParser(sample.url, $, rawText, sample.html, {
        sourceTypeHint: sample.hint,
    });
    const valid = offers
        .map((o) => normalizeOffer(o))
        .filter((o) => passesQualityGate(o, { pageLength: rawText.length, rawText }));

    console.log(`\n=== ${name} (${parserId}) — ${valid.length} valid ===`);
    if (valid.length === 0) {
        console.error('FAIL');
        process.exitCode = 1;
    } else {
        console.log(JSON.stringify(valid[0], null, 2));
        passed += 1;
    }
}
console.log(`\n${passed}/${Object.keys(SAMPLES).length} passed`);
process.exit(process.exitCode || 0);
