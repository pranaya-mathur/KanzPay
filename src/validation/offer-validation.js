import { passesQualityGate, isGarbageTitle } from '../schema/offerSchema.js';
import {
    isCategoryHeaderTitle, isShellPage, hasMeaningfulOfferFields, hasSaneAmounts,
} from './quality-rules.js';

/**
 * Crawler-side validation before dataset emit.
 * Returns { emit: boolean, reasons: string[], warnings: string[] }
 */
export function validateOfferForEmit(offer, context = {}) {
    const reasons = [];
    const warnings = [];
    const { pageType, rawText, rawHtml, pageLength, sourceType, strictGate } = context;

    if (!hasMeaningfulOfferFields(offer)) reasons.push('missing_meaningful_fields');
    if (offer.offerTitle && isGarbageTitle(offer.offerTitle)) reasons.push('garbage_title');
    if (offer.offerTitle && isCategoryHeaderTitle(offer.offerTitle, sourceType || offer.sourceType)) {
        reasons.push('category_header');
    }
    if (pageType === 'shell') reasons.push('shell_page');
    else if (pageType !== 'listing' && pageType !== 'detail' && isShellPage(rawText, rawHtml)) {
        reasons.push('shell_page');
    }
    if (pageType === 'category') reasons.push('category_page');
    if (!hasSaneAmounts(offer)) reasons.push('absurd_amounts');

    if (!passesQualityGate(offer, { pageLength, rawText })) {
        reasons.push('quality_gate_failed');
    }

    if (strictGate) {
        if (!offer.merchantName && !offer.discountValue) reasons.push('strict_missing_merchant_and_value');
        if ((offer.confidence ?? 0) < 0.35) reasons.push('strict_low_confidence');
    }

    if (offer.offerTitle && /log in or register/i.test(offer.offerDescription || '') && !offer.discountValue) {
        warnings.push('login_gated_offer');
    }

    const uniqueReasons = [...new Set(reasons)];
    return {
        emit: uniqueReasons.length === 0,
        reasons: uniqueReasons,
        warnings,
    };
}
