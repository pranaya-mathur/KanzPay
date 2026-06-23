import { detectPageType, shouldSkipPage } from '../extraction/page-type-detector.js';

/**
 * Evaluate a parsed page for source-level quality metrics (in-memory per run).
 */
export class SourceQualityTracker {
    constructor() {
        this.bySource = new Map();
    }

    record(sourceType, event) {
        if (!this.bySource.has(sourceType)) {
            this.bySource.set(sourceType, {
                pages: 0,
                offersEmitted: 0,
                skippedShell: 0,
                skippedCategory: 0,
                skippedValidation: 0,
                enqueued: 0,
            });
        }
        const stats = this.bySource.get(sourceType);
        for (const [k, v] of Object.entries(event)) {
            if (stats[k] != null) stats[k] += v;
            else stats[k] = v;
        }
    }

    recordPage(url, rawText, rawHtml, $, sourceType, outcome) {
        const pageInfo = detectPageType(url, rawText, rawHtml, $, sourceType);
        const base = { pages: 1 };
        if (shouldSkipPage(pageInfo)) {
            if (pageInfo.pageType === 'shell') base.skippedShell = 1;
            if (pageInfo.pageType === 'category') base.skippedCategory = 1;
        }
        if (outcome === 'validation_fail') base.skippedValidation = 1;
        if (outcome === 'emitted') base.offersEmitted = 1;
        this.record(sourceType, base);
        return pageInfo;
    }

    getSummary() {
        const out = {};
        for (const [k, v] of this.bySource) out[k] = { ...v };
        return out;
    }
}
