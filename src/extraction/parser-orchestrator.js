import { routeParser } from '../parsers/index.js';
import { normalizeOffer } from '../schema/offerSchema.js';
import { detectPageType, shouldSkipPage } from './page-type-detector.js';
import { validateOfferForEmit } from '../validation/offer-validation.js';
import { getSourceProfile } from '../sources/source-registry.js';
import { requiresStrictGate } from '../sources/source-policy.js';
import { PARSER_VERSION } from '../sources/source-registry.js';

/**
 * Full extraction pipeline: page typing → parse → validate → normalize.
 */
export function orchestrateExtraction(url, $, rawText, rawHtml, meta = {}, registry = null) {
    const sourceType = meta.sourceTypeHint || meta.sourceType || null;
    const pageInfo = detectPageType(url, rawText, rawHtml, $, sourceType);
    const sourceProfile = getSourceProfile(registry, sourceType);
    const strictGate = requiresStrictGate(sourceProfile);

    const parseMeta = { ...meta, pageType: pageInfo.pageType };

    if (shouldSkipPage(pageInfo) && pageInfo.pageType !== 'listing') {
        return buildResult({
            offers: [],
            skippedOffers: [],
            pageInfo,
            parserId: sourceType || 'none',
            parserName: 'skipped',
            reason: pageInfo.reason || `page_type=${pageInfo.pageType}`,
            extractionWarnings: [`skipped:${pageInfo.pageType}`],
            debugRecord: {
                url,
                pageType: pageInfo.pageType,
                skipReason: pageInfo.reason,
                parserVersion: PARSER_VERSION,
            },
        });
    }

    const routed = routeParser(url, $, rawText, rawHtml, parseMeta);
    const rawOffers = normalizeParserOutput(routed.offers);
    const extractionWarnings = [...(routed.extractionWarnings || [])];

    const offers = [];
    const skippedOffers = [];

    for (const raw of rawOffers) {
        raw.pageType = pageInfo.pageType;
        raw.parserVersion = raw.parserVersion || PARSER_VERSION;
        raw.pageLength = raw.pageLength || rawText.length;

        const validation = validateOfferForEmit(raw, {
            pageType: pageInfo.pageType,
            rawText,
            rawHtml,
            pageLength: rawText.length,
            sourceType,
            strictGate,
        });

        if (!validation.emit) {
            skippedOffers.push({
                url,
                offerTitle: raw.offerTitle,
                reasons: validation.reasons,
            });
            continue;
        }

        const normalized = normalizeOffer({
            ...raw,
            extractionWarnings: [...extractionWarnings, ...validation.warnings],
            validationReasons: validation.reasons,
        });
        offers.push(normalized);
    }

    return buildResult({
        offers,
        skippedOffers,
        pageInfo,
        parserId: routed.parserId,
        parserName: routed.parserName,
        reason: routed.reason,
        extractionWarnings,
        debugRecord: offers.length === 0 ? {
            url,
            pageType: pageInfo.pageType,
            parserName: routed.parserName,
            skippedCount: skippedOffers.length,
            parserVersion: PARSER_VERSION,
        } : null,
    });
}

function normalizeParserOutput(offers) {
    if (!offers) return [];
    if (Array.isArray(offers)) return offers;
    if (offers.offers) return offers.offers;
    return [];
}

function buildResult(payload) {
    return payload;
}
