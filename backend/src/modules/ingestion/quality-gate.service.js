import { cleanText } from '../../shared/utils/text-normalize.js';
import { isValidCouponCode } from './normalization.service.js';
import { isCategoryHeader, isGenericVisaDetail } from './confidence-score.service.js';

const GARBAGE_TITLE_PATTERNS = [
    /^oops!?$/i, /^404\b/i, /^page not found/i, /^error\b/i, /^not found$/i,
    /^access denied/i, /^login\b/i, /^sign in$/i,
];

const MIN_TITLE_LENGTH = 4;
const MIN_PAGE_LENGTH = 200;

export function hasMinimumOfferFields(offer) {
    if (!offer) return false;
    const title = cleanText(offer.offerTitle);
    if (title && title.length >= MIN_TITLE_LENGTH && !isGarbageTitle(title)) return true;
    if (cleanText(offer.discountType)) return true;
    if (isValidCouponCode(offer.couponCode)) return true;
    if (cleanText(offer.merchantName)?.length >= 2) return true;
    if (cleanText(offer.bankName)) return true;
    return false;
}

export function isGarbageTitle(title) {
    if (!title) return true;
    const t = cleanText(title);
    if (t.length < MIN_TITLE_LENGTH) return true;
    return GARBAGE_TITLE_PATTERNS.some((p) => p.test(t));
}

export function passesQualityGate(offer, options = {}) {
    const reasons = [];
    const strictGate = !!options.strictGate;

    if (!hasMinimumOfferFields(offer)) reasons.push('missing_minimum_fields');
    if (offer.offerTitle && isGarbageTitle(offer.offerTitle)) reasons.push('garbage_title');

    const body = `${offer.rawText || ''} ${offer.offerDescription || ''}`;
    if (/can't seem to find the page|page you're looking for|404 not found|oops!/i.test(body)) {
        reasons.push('error_page');
    }
    if (/try one of these popular visa pages instead/i.test(body)) {
        reasons.push('visa_shell_page');
    }

    if (offer.couponCode && !isValidCouponCode(offer.couponCode)) reasons.push('invalid_coupon');

    const pageLength = offer.pageLength || 0;
    const strongSignals = hasStrongSignals(offer);
    if (pageLength > 0 && pageLength < MIN_PAGE_LENGTH && !strongSignals) {
        reasons.push('thin_page');
    }

    if (!hasMeaningfulValue(offer)) reasons.push('zero_value_junk');

    if (offer.validTo && !isValidDateString(offer.validTo)) reasons.push('malformed_valid_to');
    if (offer.validFrom && !isValidDateString(offer.validFrom)) reasons.push('malformed_valid_from');

    if (hasAbsurdValues(offer)) reasons.push('absurd_values');

    if (isCategoryHeader(offer) && !strongSignals) reasons.push('category_header');
    if (isGenericVisaDetail(offer) && !strongSignals) reasons.push('generic_visa_detail');

    if (strictGate) {
        if (!offer.merchantName && offer.discountValue == null) {
            reasons.push('strict_missing_merchant_and_value');
        }
        if ((offer.confidence ?? 0) < 0.35) {
            reasons.push('strict_low_confidence');
        }
    }

    return {
        passed: reasons.length === 0,
        reasons,
    };
}

function hasStrongSignals(offer) {
    return (offer.discountValue != null && String(offer.discountValue).length > 0)
        || isValidCouponCode(offer.couponCode)
        || !!offer.bankName
        || (!!offer.merchantName && !!offer.discountType);
}

function hasMeaningfulValue(offer) {
    if (hasStrongSignals(offer)) return true;
    const title = offer.offerTitle;
    return title && !isGarbageTitle(title) && title.length >= MIN_TITLE_LENGTH;
}

function isValidDateString(value) {
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100;
}

function hasAbsurdValues(offer) {
    if (offer.discountType === 'percent' && Number(offer.discountValue) > 100) return true;
    if (offer.minSpend != null && offer.minSpend < 0) return true;
    if (offer.capValue != null && offer.capValue < 0) return true;
    return false;
}
