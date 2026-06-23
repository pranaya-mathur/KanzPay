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

export function buildStartUrlsFromRegistry(registry, { includeProbation = true } = {}) {
    return (registry.sources || [])
        .filter((s) => {
            if (s.status === 'rejected') return false;
            if (s.status === 'probation' && !includeProbation) return false;
            return canCrawlSource(s);
        })
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .map((s) => ({
            url: s.baseUrl,
            userData: {
                depth: 0,
                sourceType: s.sourceType,
                sourceStatus: s.status,
                sourceId: s.id || null,
            },
        }));
}
