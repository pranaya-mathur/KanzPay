import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

export const PARSER_VERSION = '2.0.0';

/** Default UAE sources — overridden by INPUT.registry.json when present. */
export const DEFAULT_SOURCES = [

    // ── Tier 1: Core banks (approved) ────────────────────────────────────────
    {
        sourceName: 'Emirates NBD Deals',
        domain: 'emiratesnbd.com',
        baseUrl: 'https://www.emiratesnbd.com/en/deals',
        sourceType: 'emiratesNbd',
        status: 'approved',
        priority: 100,
        parserProfile: {
            parserName: 'enbdParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            waitSelector: 'a[href*="/deals/"], .deal-info, h1',
            enqueueSelector: 'a[href*="/deals/"]',
        },
    },
    {
        sourceName: 'ADCB Offers',
        domain: 'adcb.com',
        baseUrl: 'https://www.adcb.com/en/personal/credit-cards/offers.aspx',
        sourceType: 'adcb',
        status: 'approved',
        priority: 95,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            waitSelector: '.offer-card, .promo-card, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'Mashreq Offers',
        domain: 'mashreq.com',
        baseUrl: 'https://www.mashreq.com/en/uae/personal/offers/',
        sourceType: 'mashreq',
        status: 'approved',
        priority: 90,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            waitSelector: '.offer-card, .promotion-item, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },

    // ── Tier 2: Banks on probation ────────────────────────────────────────────
    {
        sourceName: 'Visa UAE Offers',
        domain: 'visamiddleeast.com',
        baseUrl: 'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/',
        sourceType: 'visaUAE',
        status: 'probation',
        priority: 85,
        parserProfile: {
            parserName: 'visaParser',
            crawlerMode: 'playwright',
            maxDepth: 1,
            waitSelector: '.vs-card, .vs-cards-container',
            enqueueSelector: 'a[href*="/visa-offers-and-perks/"]',
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'FAB Card Offers',
        domain: 'bankfab.com',
        baseUrl: 'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers',
        sourceType: 'fab',
        status: 'probation',
        priority: 80,
        parserProfile: {
            parserName: 'fabParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            strictQualityGate: true,
            confidenceFloor: 0.5,
        },
    },
    {
        sourceName: 'RAK Bank Offers',
        domain: 'rakbank.ae',
        baseUrl: 'https://www.rakbank.ae/wps/portal/retail-banking/credit-cards/offers',
        sourceType: 'rakBank',
        status: 'probation',
        priority: 75,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            waitSelector: '.offer-card, .card-offer, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'Dubai Islamic Bank Offers',
        domain: 'dib.ae',
        baseUrl: 'https://www.dib.ae/personal/cards/credit-cards/offers',
        sourceType: 'dib',
        status: 'probation',
        priority: 70,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            waitSelector: '.offer, .promotion, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'HSBC UAE Offers',
        domain: 'hsbc.ae',
        baseUrl: 'https://www.hsbc.ae/credit-cards/offers/',
        sourceType: 'hsbc',
        status: 'probation',
        priority: 70,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            waitSelector: '.offer-card, .promo-card, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'Citibank UAE Promotions',
        domain: 'citibank.ae',
        baseUrl: 'https://www.citibank.ae/en/personal/promotions/',
        sourceType: 'citibank',
        status: 'probation',
        priority: 65,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            waitSelector: '.offer-card, .promo-item, article',
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
        priority: 60,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 2,
            waitSelector: '.offer-card, .deal-card, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },
    {
        sourceName: 'Mastercard UAE Promotions',
        domain: 'mastercard.ae',
        baseUrl: 'https://www.mastercard.ae/en-ae/consumers/find-card-products/promotions.html',
        sourceType: 'mastercard',
        status: 'probation',
        priority: 75,
        parserProfile: {
            parserName: 'bankOfferParser',
            crawlerMode: 'playwright',
            maxDepth: 1,
            waitSelector: '.promotion-card, .offer-card, article',
            confidenceFloor: 0.45,
            strictQualityGate: true,
        },
    },

    // ── Coupon aggregators ────────────────────────────────────────────────────
    {
        sourceName: 'Groupon UAE',
        domain: 'groupon.ae',
        baseUrl: 'https://www.groupon.ae/',
        sourceType: 'groupon',
        status: 'probation',
        priority: 55,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.deal, .coupon, [class*="coupon"], main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Cuponation UAE',
        domain: 'cuponation.ae',
        baseUrl: 'https://www.cuponation.ae/',
        sourceType: 'cuponation',
        status: 'probation',
        priority: 50,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.deal, .coupon, [class*="coupon"], main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Picodi UAE',
        domain: 'picodi.com',
        baseUrl: 'https://www.picodi.com/ae/',
        sourceType: 'picodi',
        status: 'probation',
        priority: 48,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.coupon, .promo, main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Coupons.ae',
        domain: 'coupons.ae',
        baseUrl: 'https://www.coupons.ae/',
        sourceType: 'couponsAe',
        status: 'probation',
        priority: 48,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.coupon, .deal, main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Wethrift UAE',
        domain: 'wethrift.com',
        baseUrl: 'https://www.wethrift.com/ae',
        sourceType: 'wethrift',
        status: 'probation',
        priority: 45,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.coupon, .deal, main', confidenceFloor: 0.4 },
    },

    // ── Loyalty & deal platforms ──────────────────────────────────────────────
    {
        sourceName: 'Smiles (ENOC Rewards)',
        domain: 'smiles.ae',
        baseUrl: 'https://www.smiles.ae/en/offers',
        sourceType: 'smiles',
        status: 'probation',
        priority: 55,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.offer, .deal, main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Noon Deals & Offers',
        domain: 'noon.com',
        baseUrl: 'https://www.noon.com/uae-en/offers/',
        sourceType: 'noon',
        status: 'probation',
        priority: 50,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.offer, [class*="deal"], main', confidenceFloor: 0.4 },
    },

    // ── Additional UAE sources (migration 006) ───────────────────────────────
    {
        sourceName: 'ADIB Offers',
        domain: 'adib.ae',
        baseUrl: 'https://www.adib.ae/en/personal/cards/credit-cards/offers',
        sourceType: 'adib',
        status: 'probation',
        priority: 68,
        parserProfile: { parserName: 'bankOfferParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.offer, .promotion, article', confidenceFloor: 0.45, strictQualityGate: true },
    },
    {
        sourceName: 'Standard Chartered UAE',
        domain: 'sc.com',
        baseUrl: 'https://www.sc.com/ae/credit-cards/promotions/',
        sourceType: 'scb',
        status: 'probation',
        priority: 62,
        parserProfile: { parserName: 'bankOfferParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.offer-card, .promo, article', confidenceFloor: 0.45, strictQualityGate: true },
    },
    {
        sourceName: 'Shukran Rewards',
        domain: 'shukran.com',
        baseUrl: 'https://www.shukran.com/ae/en/offers',
        sourceType: 'shukran',
        status: 'probation',
        priority: 52,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.offer, .deal, main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Blue Rewards',
        domain: 'bluerewards.ae',
        baseUrl: 'https://www.bluerewards.ae/en/offers',
        sourceType: 'blueRewards',
        status: 'probation',
        priority: 50,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.offer, .promotion, main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Talabat Offers',
        domain: 'talabat.com',
        baseUrl: 'https://www.talabat.com/uae/offers',
        sourceType: 'talabat',
        status: 'probation',
        priority: 48,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.offer, main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Namshi Deals',
        domain: 'namshi.com',
        baseUrl: 'https://www.namshi.com/uae-en/deals/',
        sourceType: 'namshi',
        status: 'probation',
        priority: 46,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.deal, main', confidenceFloor: 0.4 },
    },
    {
        sourceName: 'Amazon.ae Deals',
        domain: 'amazon.ae',
        baseUrl: 'https://www.amazon.ae/gp/goldbox',
        sourceType: 'amazonAe',
        status: 'probation',
        priority: 44,
        parserProfile: { parserName: 'couponFeedParser', crawlerMode: 'playwright', maxDepth: 2, waitSelector: '.deal, main', confidenceFloor: 0.4 },
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
