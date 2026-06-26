import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

export const PARSER_VERSION = '2.1.2';

/** Default UAE sources — overridden by INPUT.registry.json when present. */
export const DEFAULT_SOURCES = [

    // ── Tier A: Top UAE banks (approved) ───────────────────────────────────────
    {
        sourceName: 'Emirates NBD Deals',
        domain: 'emiratesnbd.com',
        baseUrl: 'https://www.emiratesnbd.com/en/deals',
        sourceType: 'emiratesNbd',
        status: 'approved',
        category: 'bank',
        priority: 100,
        parserProfile: {
            parserName: 'enbdParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 40,
            waitSelector: 'a[href*="/deals/"], .deal-info, h1',
            enqueueSelector: 'a[href*="/deals/"]',
            seedUrls: [
                'https://www.emiratesnbd.com/en/deals/good-times/ferrari-world-yas-island',
                'https://www.emiratesnbd.com/en/deals/online-shopping/noon',
                'https://www.emiratesnbd.com/en/deals/food-and-drink/talabat',
                'https://www.emiratesnbd.com/en/deals/travel/emirates-holidays',
                'https://www.emiratesnbd.com/en/deals/entertainment/vox-cinemas',
            ],
            confidenceFloor: 0.55,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'ADCB Offers',
        domain: 'adcb.com',
        baseUrl: 'https://www.adcb.com/en/personal/credit-cards/offers.aspx',
        sourceType: 'adcb',
        status: 'approved',
        category: 'bank',
        priority: 98,
        parserProfile: {
            parserName: 'adcbParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 60,
            waitSelector: '.offer-card, .promo-card, article',
            confidenceFloor: 0.55,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'Mashreq Offers',
        domain: 'mashreq.com',
        baseUrl: 'https://www.mashreq.com/en/uae/neo/offers/',
        sourceType: 'mashreq',
        status: 'approved',
        category: 'bank',
        priority: 96,
        parserProfile: {
            parserName: 'mashreqParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 50,
            waitSelector: '.ui-card h6, a[href*="/neo/offers/"], main, h1',
            seedUrls: [
                'https://www.mashreq.com/en/uae/neo/cards/credit-cards/',
                'https://www.mashreq.com/en/uae/neo/cards/debit-cards/',
                'https://www.mashreq.com/en/uae/neo/offers/early-bird-cashback/',
                'https://www.mashreq.com/en/uae/neo/offers/insurance-offers/',
                'https://www.mashreq.com/en/uae/neo/cards/credit-cards/noon-credit-card/',
                'https://www.mashreq.com/en/uae/neo/cards/credit-cards/cashback-credit-card/',
                'https://www.mashreq.com/en/uae/neo/cards/credit-cards/solitaire-credit-card/',
            ],
            confidenceFloor: 0.55,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'FAB Card Offers',
        domain: 'bankfab.com',
        baseUrl: 'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers',
        sourceType: 'fab',
        status: 'approved',
        category: 'bank',
        priority: 94,
        parserProfile: {
            parserName: 'fabParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 50,
            strictQualityGate: true,
            confidenceFloor: 0.55,
            seedUrls: [
                'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers/travel-offers',
                'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers/dining-offers',
                'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers/shopping-offers',
            ],
        },
    },
    {
        sourceName: 'Dubai Islamic Bank Offers',
        domain: 'dib.ae',
        baseUrl: 'https://www.dib.ae/offers/card-offers',
        sourceType: 'dib',
        status: 'approved',
        category: 'bank',
        priority: 92,
        parserProfile: {
            parserName: 'dibParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 30,
            waitSelector: '.card-list-item, .offer-listing-sec, .card-title-info',
            seedUrls: [
                'https://www.dib.ae/offers/card-offers',
            ],
            confidenceFloor: 0.55,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'ADIB Offers',
        domain: 'adib.ae',
        baseUrl: 'https://www.adib.ae/en/offers',
        sourceType: 'adib',
        status: 'approved',
        category: 'bank',
        priority: 90,
        parserProfile: {
            parserName: 'adibParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 25,
            waitSelector: '.offer, .promotion, article',
            confidenceFloor: 0.55,
            strictQualityGate: true,
        },
    },

    // ── Tier B: Secondary banks + networks (probation) ───────────────────────
    {
        sourceName: 'RAK Bank Offers',
        domain: 'rakbank.ae',
        baseUrl: 'https://www.rakbank.ae/wps/portal/retail-banking/credit-cards/offers',
        sourceType: 'rakBank',
        status: 'probation',
        category: 'bank',
        priority: 75,
        parserProfile: {
            parserName: 'rakbankParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 25,
            waitSelector: '.offer-card, .card-offer, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'HSBC UAE Offers',
        domain: 'hsbc.ae',
        baseUrl: 'https://www.hsbc.ae/credit-cards/special-offers/',
        sourceType: 'hsbc',
        status: 'probation',
        category: 'bank',
        priority: 70,
        parserProfile: {
            parserName: 'hsbcParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 20,
            waitSelector: 'a[href*="/special-offers/"], .offer-card, article',
            seedUrls: [
                'https://www.hsbc.ae/credit-cards/special-offers/agoda-enjoy-up-to-20-off-worldwide-hotel-bookings-31-08-2026/',
                'https://www.hsbc.ae/credit-cards/special-offers/airalo-get-a-sim-card-with-2gb-free-data-roaming-31-12-2026/',
                'https://www.hsbc.ae/credit-cards/special-offers/airalo-global-data-roaming-save-with-a-15-discount-on-roaming-data-with-airalo-10-06-2027/',
                'https://www.hsbc.ae/credit-cards/special-offers/beautiful-bundles-10-discount-on-total-bill-14-11-2026/',
                'https://www.hsbc.ae/credit-cards/special-offers/anantara-spa-anantara-the-palm-dubai-resort-30-discount-on-all-treatments-14-11-2026/',
                'https://www.hsbc.ae/credit-cards/special-offers/careem-get-a-complimentary-12-month-careem-plus-subscription-with-hsbc-simply-add-and-use-your-hsbc-credit-card-on-the-careem-app-15-11-2024/',
            ],
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'CBD Credit Card Offers',
        domain: 'cbd.ae',
        baseUrl: 'https://www.cbd.ae/personal/cards/credit-cards/offers/',
        sourceType: 'cbd',
        status: 'probation',
        category: 'bank',
        priority: 65,
        parserProfile: {
            parserName: 'cbdParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            maxRequestsBudget: 15,
            waitSelector: '.offer-card, .deal-card, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'Visa UAE Offers',
        domain: 'visamiddleeast.com',
        baseUrl: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/',
        sourceType: 'visaUAE',
        status: 'probation',
        category: 'network',
        priority: 68,
        parserProfile: {
            parserName: 'visaParser',
            crawlerMode: 'playwright',
            maxDepth: 1,
            maxRequestsBudget: 30,
            waitSelector: '.vs-card, .vs-cards-container',
            enqueueSelector: 'a[href*="/visa-offers-and-perks/"]',
            strictQualityGate: true,
            confidenceFloor: 0.45,
        },
    },
    {
        sourceName: 'Citibank UAE Promotions',
        domain: 'citibank.ae',
        baseUrl: 'https://www.citibank.ae/en/personal/promotions/',
        sourceType: 'citibank',
        status: 'rejected',
        category: 'bank',
        priority: 40,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            autoCrawl: false,
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'Mastercard UAE Promotions',
        domain: 'mastercard.ae',
        baseUrl: 'https://www.mastercard.ae/en-ae/consumers/find-card-products/promotions.html',
        sourceType: 'mastercard',
        status: 'rejected',
        category: 'network',
        priority: 75,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 1,
            autoCrawl: false,
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },

    // ── Coupon aggregators (excluded from default crawl) ─────────────────────
    {
        sourceName: 'Groupon UAE',
        domain: 'groupon.ae',
        baseUrl: 'https://www.groupon.ae/',
        sourceType: 'groupon',
        status: 'rejected',
        category: 'coupon',
        priority: 55,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Cuponation UAE',
        domain: 'cuponation.ae',
        baseUrl: 'https://www.cuponation.ae/',
        sourceType: 'cuponation',
        status: 'probation',
        category: 'coupon',
        priority: 50,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Picodi UAE',
        domain: 'picodi.com',
        baseUrl: 'https://www.picodi.com/ae/',
        sourceType: 'picodi',
        status: 'probation',
        category: 'coupon',
        priority: 48,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Coupons.ae',
        domain: 'coupons.ae',
        baseUrl: 'https://www.coupons.ae/',
        sourceType: 'couponsAe',
        status: 'probation',
        category: 'coupon',
        priority: 48,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Wethrift UAE',
        domain: 'wethrift.com',
        baseUrl: 'https://www.wethrift.com/ae',
        sourceType: 'wethrift',
        status: 'probation',
        category: 'coupon',
        priority: 45,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },

    // ── Loyalty & deal platforms (excluded from default crawl) ────────────────
    {
        sourceName: 'Smiles (ENOC Rewards)',
        domain: 'smiles.ae',
        baseUrl: 'https://www.smiles.ae/en/offers',
        sourceType: 'smiles',
        status: 'probation',
        category: 'loyalty',
        priority: 55,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Noon Deals & Offers',
        domain: 'noon.com',
        baseUrl: 'https://www.noon.com/uae-en/offers/',
        sourceType: 'noon',
        status: 'probation',
        category: 'merchant',
        priority: 50,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },

    // ── Additional UAE sources (migration 006) ───────────────────────────────
    {
        sourceName: 'Standard Chartered UAE',
        domain: 'sc.com',
        baseUrl: 'https://www.sc.com/ae/credit-cards/promotions/',
        sourceType: 'scb',
        status: 'rejected',
        category: 'bank',
        priority: 35,
        parserProfile: { parserName: 'bankOfferParser', crawlerMode: 'playwright', maxDepth: 2, autoCrawl: false, waitSelector: '.offer-card, .promo, article', confidenceFloor: 0.45, strictQualityGate: true },
    },
    {
        sourceName: 'Shukran Rewards',
        domain: 'shukran.com',
        baseUrl: 'https://www.shukran.com/ae/en/offers',
        sourceType: 'shukran',
        status: 'probation',
        category: 'loyalty',
        priority: 52,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Blue Rewards',
        domain: 'bluerewards.ae',
        baseUrl: 'https://www.bluerewards.ae/en/offers',
        sourceType: 'blueRewards',
        status: 'probation',
        category: 'loyalty',
        priority: 50,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Talabat Offers',
        domain: 'talabat.com',
        baseUrl: 'https://www.talabat.com/uae',
        sourceType: 'talabat',
        status: 'probation',
        category: 'merchant',
        priority: 48,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Namshi Deals',
        domain: 'namshi.com',
        baseUrl: 'https://www.namshi.com/uae-en/deals/',
        sourceType: 'namshi',
        status: 'probation',
        category: 'merchant',
        priority: 46,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Amazon.ae Deals',
        domain: 'amazon.ae',
        baseUrl: 'https://www.amazon.ae/gp/goldbox',
        sourceType: 'amazonAe',
        status: 'probation',
        category: 'merchant',
        priority: 44,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 1, autoCrawl: false, confidenceFloor: 0.4 },
    },
];

const REGISTRY_PATHS = [
    path.join(PROJECT_ROOT, 'storage/key_value_stores/default/INPUT.registry.json'),
    path.join(PROJECT_ROOT, 'backend/storage/key_value_stores/default/INPUT.registry.json'),
];

export function loadRegistryFromFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeRegistryPayload(data);
}

export function normalizeRegistryPayload(data) {
    if (!data) return null;
    const plan = data.sourceRegistryPlan?.targets || [];
    const startUrls = data.startUrls || [];

    const sources = plan.length
        ? plan.map((t) => ({
            sourceName: t.sourceName,
            domain: tryDomain(t.url),
            baseUrl: t.url,
            sourceType: t.sourceType || t.userData?.sourceType,
            status: t.status || 'approved',
            priority: t.priority ?? 50,
            parserProfile: t.constraints || {},
        }))
        : startUrls.map((s) => {
            const url = typeof s === 'string' ? s : s.url;
            const sourceType = s.userData?.sourceType || inferType(url);
            return {
                sourceName: sourceType,
                domain: tryDomain(url),
                baseUrl: url,
                sourceType,
                status: 'approved',
                priority: 50,
                parserProfile: {},
            };
        });

    return { sources, crawlerMode: data.crawlerMode, maxDepth: data.maxDepth, allowedDomains: data.allowedDomains };
}

function tryDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function inferType(url) {
    const lower = (url || '').toLowerCase();
    if (lower.includes('emiratesnbd'))  return 'emiratesNbd';
    if (lower.includes('bankfab'))      return 'fab';
    if (lower.includes('adcb.com'))     return 'adcb';
    if (lower.includes('mashreq.com'))  return 'mashreq';
    if (lower.includes('rakbank.ae'))   return 'rakBank';
    if (/\bdib\.ae\b/.test(lower))      return 'dib';
    if (lower.includes('hsbc.ae'))      return 'hsbc';
    if (lower.includes('citibank.ae'))  return 'citibank';
    if (/\bcbd\.ae\b/.test(lower))      return 'cbd';
    if (lower.includes('visamiddleeast') || lower.includes('visa.co.ae')) return 'visaUAE';
    if (/mastercard\.(ae|com)/.test(lower)) return 'mastercard';
    if (lower.includes('groupon.ae'))   return 'groupon';
    if (lower.includes('cuponation'))   return 'cuponation';
    if (lower.includes('picodi'))       return 'picodi';
    if (lower.includes('coupons.ae'))   return 'couponsAe';
    if (lower.includes('wethrift'))     return 'wethrift';
    if (lower.includes('smiles.ae'))    return 'smiles';
    if (lower.includes('noon.com'))     return 'noon';
    if (lower.includes('adib.ae'))      return 'adib';
    if (lower.includes('sc.com'))       return 'scb';
    if (lower.includes('shukran'))      return 'shukran';
    if (lower.includes('bluerewards'))  return 'blueRewards';
    if (lower.includes('talabat'))      return 'talabat';
    if (lower.includes('namshi'))       return 'namshi';
    if (lower.includes('amazon.ae'))    return 'amazonAe';
    return 'generic';
}

export function resolveRegistry(input = {}) {
    if (input.sourceRegistry?.sources?.length) {
        return { sources: input.sourceRegistry.sources, ...input.sourceRegistry };
    }

    for (const p of REGISTRY_PATHS) {
        const loaded = loadRegistryFromFile(p);
        if (loaded?.sources?.length) return loaded;
    }

    return { sources: DEFAULT_SOURCES, crawlerMode: 'playwright', maxDepth: 2 };
}

export function getSourcesByStatus(registry, status) {
    return (registry.sources || []).filter((s) => s.status === status);
}

export function getSourceProfile(registry, sourceType) {
    if (!registry) return null;
    return (registry.sources || []).find((s) => s.sourceType === sourceType) || null;
}
