import config from '../../config.js';
import { getParserProfile, STATUS_CONFIDENCE_FLOOR_OVERRIDE } from '../../shared/schemas/source.schema.js';
import { statusAllowsAutoCrawl, statusAllowsIngestion } from './source-classifier.service.js';

export function resolveConfidenceFloor(source) {
    const profile = getParserProfile(source.sourceType, source.parserProfileJson);
    const profileFloor = profile.confidenceFloor ?? config.confidenceFloor;

    if (source.status === 'rejected') {
        return STATUS_CONFIDENCE_FLOOR_OVERRIDE.rejected ?? 0.99;
    }
    if (source.status === 'probation') {
        const probationMin = STATUS_CONFIDENCE_FLOOR_OVERRIDE.probation ?? 0.45;
        return Math.max(profileFloor, probationMin);
    }
    return profileFloor;
}

export function resolveStrictQualityGate(source) {
    const profile = getParserProfile(source.sourceType, source.parserProfileJson);
    if (source.status === 'probation') return true;
    return !!profile.strictQualityGate;
}

export function canCrawlSource(source) {
    if (!source) return false;
    const rules = source.crawlRulesJson || {};
    if (rules.autoCrawl === false) return false;
    return statusAllowsAutoCrawl(source.status);
}

export function canIngestFromSource(source) {
    if (!source) return true;
    return statusAllowsIngestion(source.status);
}

export function getCrawlConstraints(source) {
    const profile = getParserProfile(source.sourceType, source.parserProfileJson);
    const rules = source.crawlRulesJson || {};
    return {
        crawlerMode: profile.crawlerMode || 'playwright',
        maxDepth: profile.maxDepth ?? 1,
        parserName: profile.parserName,
        waitSelector: profile.waitSelector,
        enqueueSelector: profile.enqueueSelector,
        allowedPaths: rules.allowedPaths || [],
        excludePaths: rules.excludePaths || [],
        strictQualityGate: resolveStrictQualityGate(source),
        confidenceFloor: resolveConfidenceFloor(source),
        priority: source.priority ?? 50,
    };
}

export function applySourceConfidenceAdjustment(baseConfidence, source) {
    if (!source) return baseConfidence;
    const registryConfidence = Number(source.confidence) || 0;
    const blended = baseConfidence * 0.7 + registryConfidence * 0.3;
    if (source.status === 'probation') return Math.round(blended * 0.92 * 1000) / 1000;
    if (source.status === 'rejected') return Math.round(blended * 0.5 * 1000) / 1000;
    return Math.round(blended * 1000) / 1000;
}
