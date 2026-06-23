const BANK_ALIASES = {
    'emirates nbd': 'Emirates NBD',
    enbd: 'Emirates NBD',
    'first abu dhabi bank': 'First Abu Dhabi Bank',
    fab: 'First Abu Dhabi Bank',
    'abu dhabi commercial bank': 'ADCB',
    adcb: 'ADCB',
};

const CARD_ALIASES = {
    'visa infinite': 'Visa Infinite',
    'visa signature': 'Visa Signature',
    'visa platinum': 'Visa Platinum',
    mastercard: 'Mastercard',
};

const CATEGORY_MCC_MAP = {
    grocery: ['5411'],
    dining: ['5812', '5814'],
    travel: ['3000', '4511', '7011', '4722'],
    fuel: ['5541', '5542'],
    shopping: ['5311', '5331', '5399'],
    fashion: ['5651', '5691', '5699'],
    electronics: ['5732', '5734'],
    entertainment: ['7832', '7922', '7996'],
    jewelry: ['5944'],
};

const CATEGORY_KEYWORDS = [
    { key: 'dining', pattern: /dining|restaurant|food|drink|cafe/i },
    { key: 'travel', pattern: /travel|hotel|flight|airline|airport/i },
    { key: 'shopping', pattern: /shopping|retail|mall|hypermarket/i },
    { key: 'entertainment', pattern: /entertainment|theme park|cinema|theatre|theater/i },
    { key: 'fashion', pattern: /fashion|apparel|clothing/i },
    { key: 'fuel', pattern: /fuel|petrol|gas station/i },
];

export function cleanText(text) {
    if (!text) return '';
    return String(text)
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function toNumber(str) {
    if (str === null || str === undefined || str === '') return null;
    const num = parseFloat(String(str).replace(/,/g, '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) ? num : null;
}

export function findCurrency(text) {
    if (!text) return null;
    if (/AED|Dhs|dirham/i.test(text)) return 'AED';
    if (/USD|\$|US\s*dollar/i.test(text)) return 'USD';
    if (/EUR|€/i.test(text)) return 'EUR';
    return null;
}

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

export function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
}

export function normalizeBankName(name) {
    if (!name) return null;
    const key = cleanText(name).toLowerCase();
    return BANK_ALIASES[key] || cleanText(name);
}

export function normalizeCardName(name) {
    if (!name) return null;
    const key = cleanText(name).toLowerCase();
    return CARD_ALIASES[key] || cleanText(name);
}

export function normalizeMerchantName(name) {
    if (!name) return null;
    const cleaned = cleanText(name);
    if (!cleaned || cleaned.length < 2) return null;
    if (/^(?:cards?\s*&\s*rewards?|seasonal offers?|online offers?)$/i.test(cleaned)) return null;
    return cleaned;
}

export function normalizeDiscountType(type) {
    if (!type) return null;
    const t = String(type).toLowerCase();
    const allowed = ['percent', 'fixed', 'cashback', 'coupon', 'points', 'emi', 'installment', 'complimentary', 'other'];
    return allowed.includes(t) ? t : null;
}

export function inferCategoriesFromText(text) {
    if (!text) return [];
    const found = [];
    for (const { key, pattern } of CATEGORY_KEYWORDS) {
        if (pattern.test(text)) found.push(key);
    }
    return uniq(found);
}

export function inferMccFromCategories(categories = []) {
    const mccs = new Set();
    for (const cat of categories) {
        const key = String(cat).toLowerCase();
        for (const mcc of CATEGORY_MCC_MAP[key] || []) mccs.add(mcc);
    }
    return [...mccs];
}

export function normalizeCurrency(value, text = '') {
    return value || findCurrency(text) || 'AED';
}

export function slugify(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
