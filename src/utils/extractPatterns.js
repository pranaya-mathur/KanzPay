export const PATTERNS = {
    cashback: /(?:up\s+to\s+)?(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:cash\s*back|cashback)/i,
    cashbackGeneric: /cashback|cash\s*back/i,
    percentDiscount: /(?:up\s+to\s+)?(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:off|discount|save|cashback)?/i,
    percentOffPhrase: /(\d{1,2}(?:\.\d{1,2})?)\s*%\s*off/i,
    fixedDiscount: /(?:AED|Dhs|د\.?إ)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:off|discount|save|cashback)?/i,
    fixedOffPhrase: /(?:save|get)\s+(?:AED|Dhs)\s*(\d+(?:[.,]\d{1,2})?)/i,
    couponCode: /(?:coupon|promo(?:tion)?\s*code|voucher\s*code|use\s+code|code)[\s:]+([A-Z][A-Z0-9_-]{2,19})/i,
    couponCodeInline: /\b([A-Z]{4,12}\d{0,4})\b/,
    minSpend: /(?:min(?:imum)?\s*(?:spend|purchase|order|cart(?:\s*value)?|monthly\s*spend)|spend\s*(?:of|at\s*least))\s*(?:AED|Dhs)?\s*(\d+(?:[.,]\d{1,2})?)/i,
    minMonthlySpend: /minimum\s+monthly\s+spend\s*(?:of)?\s*(?:AED|Dhs)?\s*(\d+(?:[.,]\d{1,2})?)/i,
    cap: /(?:capped?\s+at|max(?:imum)?|up\s+to)\s*(?:AED|Dhs)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:per\s+month|monthly|cashback|discount)?/i,
    capPercent: /capped?\s+at\s+(\d{1,2}(?:\.\d{1,2})?)\s*%/i,
    validity: /valid\s+(?:until|till|thru|from|through)\s*([0-9]{1,2}[\s/.-][A-Za-z0-9\s,.-]+)/i,
    validityShort: /(?:expires?|expiry|ends?)\s*(?:on|by)?\s*([0-9]{1,2}[\s/.-][A-Za-z0-9\s,.-]+)/i,
    cardholders: /(?:Emirates\s+NBD|ENBD|FAB|First\s+Abu\s+Dhabi|Visa|Mastercard|cardholder|credit\s+card|debit\s+card)/i,
    complimentary: /complimentary|free\s+(?:flight|lounge|access|valet)/i,
    lounge: /airport\s+lounge|lounge\s+access/i,
    emi: /(?:\d+)\s*(?:months?|EMI)\s*(?:installment|instalment|plan)?/i,
    points: /(\d+(?:,\d{3})*)\s*(?:bonus\s+)?(?:points|miles|rewards?)/i,
    cardTypes: /(credit\s+card|debit\s+card|prepaid\s+card|mastercard|visa\s+infinite|visa\s+signature)/gi,
    categories: {
        grocery: /grocery|supermarket|carrefour|lulu|spinneys/i,
        dining: /dining|restaurant|food|talabat|zomato|deliveroo/i,
        travel: /travel|flight|hotel|booking\.com|agoda|airline/i,
        fuel: /fuel|petrol|enoc|adnoc/i,
        shopping: /shopping|retail|mall/i,
        fashion: /fashion|clothing|apparel|namshi|noon/i,
        electronics: /electronics|gadget|sharaf\s*dg|amazon/i,
        entertainment: /entertainment|cinema|movie|vox|ticket/i,
        jewelry: /jewelry|jewellery|gold|diamond/i,
    },
};

export function extractMatch(text, pattern, groupIndex = 1) {
    if (!text) return null;
    const match = text.match(pattern);
    if (!match) return null;
    const val = match[groupIndex];
    return val != null ? String(val).trim() : null;
}

export function extractAllMatches(text, pattern, groupIndex = 1) {
    if (!text) return [];
    const results = [];
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m[groupIndex]) results.push(String(m[groupIndex]).trim());
    }
    return results;
}

export function detectCategories(text) {
    if (!text) return [];
    return Object.entries(PATTERNS.categories)
        .filter(([, re]) => re.test(text))
        .map(([name]) => name);
}

export function detectDiscountType(text) {
    if (!text) return { discountType: null, discountValue: null };

    const cashbackVal = extractMatch(text, PATTERNS.cashback);
    if (cashbackVal || PATTERNS.cashbackGeneric.test(text)) {
        return {
            discountType: 'cashback',
            discountValue: cashbackVal || extractMatch(text, PATTERNS.percentDiscount),
        };
    }

    const pct = extractMatch(text, PATTERNS.percentOffPhrase) || extractMatch(text, PATTERNS.percentDiscount);
    if (pct) return { discountType: 'percent', discountValue: pct };

    const fixed = extractMatch(text, PATTERNS.fixedDiscount) || extractMatch(text, PATTERNS.fixedOffPhrase);
    if (fixed) return { discountType: 'fixed', discountValue: fixed };

    if (PATTERNS.complimentary.test(text)) {
        return { discountType: 'complimentary', discountValue: null };
    }

    if (PATTERNS.emi.test(text)) {
        const emiMatch = text.match(PATTERNS.emi);
        return { discountType: 'emi', discountValue: emiMatch ? emiMatch[0] : null };
    }

    const pts = extractMatch(text, PATTERNS.points);
    if (pts) return { discountType: 'points', discountValue: pts.replace(/,/g, '') };

    const code = extractMatch(text, PATTERNS.couponCode);
    if (code) return { discountType: 'coupon', discountValue: null };

    return { discountType: null, discountValue: null };
}

export function extractPaymentMethods(text) {
    if (!text) return [];
    const methods = new Set();
    const matches = text.match(PATTERNS.cardTypes) || [];
    for (const m of matches) methods.add(normalizePaymentLabel(m));
    if (/emirates\s*nbd|enbd/i.test(text)) methods.add('Emirates NBD Card');
    if (/\bfab\b|first\s+abu\s+dhabi/i.test(text)) methods.add('FAB Card');
    if (/\bvisa\b/i.test(text) && !/visa\s+(?:infinite|signature|platinum)/i.test(text)) methods.add('Visa');
    if (/\bmastercard\b/i.test(text)) methods.add('Mastercard');
    return [...methods];
}

function normalizePaymentLabel(label) {
    const l = label.toLowerCase();
    if (l.includes('credit')) return 'Credit Card';
    if (l.includes('debit')) return 'Debit Card';
    if (l.includes('prepaid')) return 'Prepaid Card';
    if (l.includes('mastercard')) return 'Mastercard';
    if (l.includes('visa')) return 'Visa';
    return label;
}
