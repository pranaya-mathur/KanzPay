/** Shared bank-offer noise filters for backend ingestion. */

export function isEarnRateNoise(text) {
    const t = (text || '').toLowerCase();
    if (/bonus\s+touchpoint/.test(t) && /every\s+aed\s*1\s+spent/.test(t)) return true;
    if (/earn\s+\d+\s+bonus\s+touchpoint/.test(t)) return true;
    if (/for\s+every\s+aed\s*1\s+spent/.test(t) && !/(?:%\s*off|cashback)/.test(t)) return true;
    return false;
}

export function isAdcbNavNoise(text) {
    const t = (text || '').toLowerCase();
    if (/adcb\s+logo\s+facebook/.test(t)) return true;
    if (/refer\s+(?:a\s+friend|your\s+friends)/.test(t)) return true;
    if (/touchpoints\s+max/.test(t)) return true;
    return false;
}

export function isTouchpointsBurnOffer(text) {
    const t = (text || '').toLowerCase();
    return /pay\s+with\s+touchpoints|convert\s+\d[\d,]*\s*touchpoints/.test(t);
}

export const BANK_NAME_BY_SOURCE = {
    emiratesNbd: 'Emirates NBD',
    adcb: 'ADCB',
    mashreq: 'Mashreq',
    fab: 'First Abu Dhabi Bank',
    dib: 'Dubai Islamic Bank',
    adib: 'ADIB',
    rakBank: 'RAK Bank',
    hsbc: 'HSBC',
    cbd: 'CBD',
    citibank: 'Citibank',
    scb: 'Standard Chartered',
};

export function inferBankNameFromSource(sourceType, existingBankName = null) {
    if (existingBankName) return existingBankName;
    return BANK_NAME_BY_SOURCE[sourceType] || null;
}

const FX_CURRENCY = '(?:AED|Dhs|EUR|USD|AUD|SGD|GBP|FJD)';

/** Recognize checkout-relevant signals when structured discount fields are missing. */
export function hasBankCheckoutSignal(offer) {
    const hasCashbackAmount = offer.discountType === 'cashback'
        && Number(offer.discountValue) > 1;
    const hasMerchantDiscount = offer.merchantName
        && offer.discountValue != null
        && Number(offer.discountValue) > 0;
    const hasExpiry = !!offer.validTo;
    if (hasMerchantDiscount || hasCashbackAmount || hasExpiry) return true;

    const categories = offer.categories || [];
    if (categories.includes('instalment_plan')) return true;

    if (offer.discountType === 'emi' && offer.merchantName) return true;
    if (offer.discountType === 'complimentary' && offer.merchantName) return true;

    const body = `${offer.offerTitle || ''} ${offer.offerDescription || ''} ${offer.rawText || ''}`;
    if (/0%\s*(?:interest|epp|easy\s+payment|installment|instalment)/i.test(body)) return true;
    if (/interest\s+payment\s+plan|easy\s+payment\s+plan|flexi\s+instalment/i.test(body)) return true;
    if (new RegExp(`${FX_CURRENCY}\\s*\\d+(?:[.,]\\d+)?\\s*cashback`, 'i').test(body)) return true;
    if (/cashback/i.test(body) && new RegExp(`${FX_CURRENCY}\\s*\\d`, 'i').test(body)) return true;
    if (/starting\s+from\s+(?:AED|Dhs)\s*\d/i.test(body)) return true;
    if (/buy\s+\d+\s+get\s+\d+|bogo|complimentary/i.test(body) && offer.merchantName) return true;

    return false;
}

/** Backfill discountType/discountValue from title text when parsers omit structured fields. */
export function inferDiscountFromText(text, discountType = null, discountValue = null) {
    const combined = (text || '').trim();
    if (!combined) return { discountType, discountValue };

    if (discountValue != null && Number(discountValue) > 0) {
        return { discountType, discountValue };
    }

    const fxCashback = combined.match(new RegExp(`${FX_CURRENCY}\\s*(\\d+(?:[.,]\\d+)?)\\s*cashback`, 'i'));
    if (fxCashback) {
        return { discountType: 'cashback', discountValue: Number(fxCashback[1].replace(/,/g, '')) };
    }

    const startingFrom = combined.match(/starting\s+from\s+(?:AED|Dhs)\s*(\d[\d,]*)/i);
    if (startingFrom) {
        return {
            discountType: discountType || 'fixed',
            discountValue: Number(startingFrom[1].replace(/,/g, '')),
        };
    }

    if (/0%\s*(?:interest|epp|easy\s+payment|installment|instalment)/i.test(combined)) {
        return { discountType: 'emi', discountValue: discountValue ?? '0%' };
    }

    const pct = combined.match(/(\d{1,2})\s*%\s*(?:off|interest|epp|discount)?/i);
    if (pct && (!discountType || discountType === 'percent')) {
        return { discountType: 'percent', discountValue: Number(pct[1]) };
    }

    return { discountType, discountValue };
}
