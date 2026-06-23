/**
 * @file normalize.js
 * Low-level text/number/date normalization helpers used by offerSchema.
 */

const DISCOUNT_TYPES = [
    'percent', 'fixed', 'cashback', 'coupon', 'points',
    'emi', 'installment', 'complimentary', 'other',
];

const BANK_ALIASES = {
    'emirates nbd': 'Emirates NBD',
    enbd: 'Emirates NBD',
    'first abu dhabi bank': 'First Abu Dhabi Bank',
    fab: 'First Abu Dhabi Bank',
    'abu dhabi commercial bank': 'ADCB',
    adcb: 'ADCB',
    'dubai islamic bank': 'Dubai Islamic Bank',
    dib: 'Dubai Islamic Bank',
    'mashreq bank': 'Mashreq',
    mashreq: 'Mashreq',
};

const CARD_ALIASES = {
    'visa infinite': 'Visa Infinite',
    'visa signature': 'Visa Signature',
    'visa platinum': 'Visa Platinum',
    mastercard: 'Mastercard',
    'world elite': 'World Elite Mastercard',
};

/** @param {string|null|undefined} text */
export function cleanText(text) {
    if (!text) return '';
    return String(text)
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** @param {string|number|null|undefined} str */
export function toNumber(str) {
    if (str === null || str === undefined || str === '') return null;
    const num = parseFloat(String(str).replace(/,/g, '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) ? num : null;
}

/** @param {string|null|undefined} text */
export function findCurrency(text) {
    if (!text) return null;
    if (/AED|Dhs|د\.?إ|dirham/i.test(text)) return 'AED';
    if (/USD|\$|US\s*dollar/i.test(text)) return 'USD';
    if (/EUR|€/i.test(text)) return 'EUR';
    return null;
}

/** @param {string|null|undefined} dateStr */
export function parseDate(dateStr) {
    if (!dateStr) return null;
    const cleaned = cleanText(dateStr)
        .replace(/(\d{1,2})(st|nd|rd|th)/gi, '$1')
        .replace(/\s+/g, ' ');

    const dmy = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) {
        const iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime())) return iso;
    }

    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
        return parsed.toISOString().split('T')[0];
    }
    return null;
}

/** @param {Array<string|null|undefined>} arr */
export function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
}

/** @param {string|null|undefined} text */
export function isStackable(text) {
    if (!text) return false;
    if (/(?:not|cannot|can't)\s+(?:be\s+)?(?:combined|clubbed|used in conjunction|stacked)/i.test(text)) {
        return false;
    }
    if (/can be (?:combined|clubbed|stacked)/i.test(text)) return true;
    return false;
}

export function normalizeBankName(name) {
    if (!name) return null;
    const key = cleanText(name).toLowerCase();
    return BANK_ALIASES[key] || cleanText(name);
}

export function normalizeCardName(name) {
    if (!name) return null;
    const lower = cleanText(name).toLowerCase();
    for (const [alias, canonical] of Object.entries(CARD_ALIASES)) {
        if (lower.includes(alias)) return canonical;
    }
    return cleanText(name);
}

export function normalizeMerchantName(name) {
    if (!name) return null;
    return cleanText(name)
        .replace(/^(?:at|with|from|for)\s+/i, '')
        .replace(/\s+(?:offer|deal|promotion)$/i, '')
        .trim() || null;
}

export function normalizeDiscountType(type) {
    if (!type) return null;
    const t = String(type).toLowerCase();
    if (DISCOUNT_TYPES.includes(t)) return t;
    if (/cash\s*back/.test(t)) return 'cashback';
    if (/%|percent/.test(t)) return 'percent';
    if (/fixed|aed|amount/.test(t)) return 'fixed';
    if (/coupon|code/.test(t)) return 'coupon';
    if (/point|mile/.test(t)) return 'points';
    if (/emi|install/.test(t)) return 'emi';
    if (/compliment|free/.test(t)) return 'complimentary';
    return 'other';
}
