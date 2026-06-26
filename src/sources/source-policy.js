export function canCrawlSource(source) {
    if (!source) return false;
    if (source.status === 'rejected') return false;
    if (source.parserProfile?.autoCrawl === false) return false;
    return source.status === 'approved' || source.status === 'probation';
}

export function getConfidenceFloor(source, defaultFloor = 0.4) {
    if (!source) return defaultFloor;
    const profile = source.parserProfile || {};
    if (source.status === 'probation') {
        return Math.max(profile.confidenceFloor ?? 0.45, defaultFloor);
    }
    return profile.confidenceFloor ?? defaultFloor;
}

export function requiresStrictGate(source) {
    if (!source) return false;
    return source.status === 'probation' || !!source.parserProfile?.strictQualityGate;
}

export function buildStartUrlsFromRegistry(registry, {
    includeProbation = true,
    sourceCategories = ['bank', 'network'],
} = {}) {
    const urls = [];
    const seen = new Set();

    const addUrl = (url, sourceType, status, sourceId = null) => {
        const normalized = (url || '').replace(/\/$/, '');
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        urls.push({
            url,
            userData: {
                depth: 0,
                sourceType,
                sourceStatus: status,
                sourceId,
            },
        });
    };

    (registry.sources || [])
        .filter((s) => {
            if (s.status === 'rejected') return false;
            if (s.status === 'probation' && !includeProbation) return false;
            if (s.parserProfile?.autoCrawl === false) return false;
            const category = s.category || inferSourceCategory(s.sourceType);
            if (sourceCategories?.length && !sourceCategories.includes(category)) return false;
            return canCrawlSource(s);
        })
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .forEach((s) => {
            addUrl(s.baseUrl, s.sourceType, s.status, s.id || null);
            for (const seed of s.parserProfile?.seedUrls || []) {
                addUrl(seed, s.sourceType, s.status, s.id || null);
            }
        });

    return urls;
}

/** Per-source crawl request budgets (wallet-share weighted). */
export const DEFAULT_REQUEST_BUDGETS = {
    adcb: 60,
    mashreq: 50,
    fab: 50,
    emiratesNbd: 40,
    dib: 30,
    adib: 25,
    rakBank: 25,
    visaUAE: 30,
    hsbc: 20,
    cbd: 15,
};

export function getSourceRequestBudget(sourceType, registry = null) {
    if (!sourceType) return 25;
    const source = registry?.sources?.find((s) => s.sourceType === sourceType);
    const fromProfile = source?.parserProfile?.maxRequestsBudget;
    if (fromProfile != null) return fromProfile;
    return DEFAULT_REQUEST_BUDGETS[sourceType] ?? 25;
}

export function inferSourceCategory(sourceType) {
    const bank = ['emiratesNbd', 'adcb', 'mashreq', 'rakBank', 'dib', 'hsbc', 'citibank', 'cbd', 'adib', 'scb', 'fab'];
    const network = ['visaUAE', 'mastercard'];
    const coupon = ['groupon', 'cuponation', 'picodi', 'couponsAe', 'wethrift', 'couponFeed'];
    const loyalty = ['smiles', 'shukran', 'blueRewards'];
    const merchant = ['noon', 'namshi', 'talabat', 'amazonAe', 'merchant'];
    if (bank.includes(sourceType)) return 'bank';
    if (network.includes(sourceType)) return 'network';
    if (coupon.includes(sourceType)) return 'coupon';
    if (loyalty.includes(sourceType)) return 'loyalty';
    if (merchant.includes(sourceType)) return 'merchant';
    return 'generic';
}
