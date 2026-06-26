/**
 * Mashreq Neo offers GraphQL payload parser.
 */
import { cleanText, parseDate } from '../utils/normalize.js';
import { detectDiscountType } from '../utils/extractPatterns.js';
import {
    isMashreqVantageNoise, isMashreqEppOffer,
} from '../validation/quality-rules.js';
import { BANK_META, buildStandardBankOffer } from './bank-parser-base.js';

const PARSER = 'mashreqApiParser';
const bankMeta = BANK_META.mashreq;

export const MASHREQ_GQL_URL_PATTERN = /mashreq\.com\/api\/gql/i;

export function isMashreqOffersGqlPayload(json) {
    if (!json) return false;
    const root = Array.isArray(json) ? json[0] : json;
    return Boolean(root?.data?.search?.results?.items?.length);
}

function parseSitecoreDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})(\d{2})(\d{2})T/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return parseDate(value);
}

function offerDetailUrl(baseUrl, itemId) {
    if (!itemId) return baseUrl;
    try {
        const u = new URL(baseUrl);
        u.searchParams.set('offerId', itemId.replace(/[{}]/g, ''));
        return u.href;
    } catch {
        return baseUrl;
    }
}

/**
 * @param {unknown} json GraphQL response (array or object)
 * @param {string} baseUrl Listing URL for source attribution
 * @param {object} meta Crawl meta
 */
export function parseMashreqApiPayload(json, baseUrl, meta = {}) {
    const root = Array.isArray(json) ? json[0] : json;
    const items = root?.data?.search?.results?.items || [];
    const offers = [];
    const seen = new Set();
    const reason = `mode=mashreq-api; items=${items.length}`;

    for (const row of items) {
        const item = row?.item;
        if (!item?.title?.value) continue;

        const title = cleanText(item.title.value);
        const description = cleanText(item.shortMultiline?.value || '');
        const combined = `${title} ${description}`;
        const paymentCategory = cleanText(item.parent?.title?.value || '');
        const itemId = item.id || item.name;
        const detailUrl = offerDetailUrl(baseUrl, itemId);
        const dedupeKey = `${title}::${paymentCategory}`;
        if (seen.has(dedupeKey)) continue;

        if (isMashreqVantageNoise(combined)) continue;

        const validTo = parseSitecoreDate(item.toDate?.value);
        const { discountType, discountValue } = detectDiscountType(combined);
        const hasCheckoutDiscount = discountType && discountValue != null && Number(discountValue) > 0;

        if (isMashreqEppOffer(combined, paymentCategory)) {
            if (!validTo) continue;
            seen.add(dedupeKey);
            offers.push(buildStandardBankOffer({
                url: detailUrl,
                title,
                merchant: title,
                description,
                rawText: combined,
                meta,
                bankMeta,
                parserName: PARSER,
                reason: `${reason}; epp`,
                extraCategories: ['instalment_plan'],
            }));
            continue;
        }

        if (!hasCheckoutDiscount && !validTo) continue;

        seen.add(dedupeKey);
        offers.push(buildStandardBankOffer({
            url: detailUrl,
            title,
            merchant: title,
            description,
            rawText: combined,
            meta,
            bankMeta,
            parserName: PARSER,
            reason: `${reason}; checkout`,
            extraCategories: hasCheckoutDiscount ? ['merchant_discount'] : [],
        }));
    }

    return offers;
}
