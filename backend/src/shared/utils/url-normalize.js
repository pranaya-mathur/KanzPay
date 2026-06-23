const TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref', 'source', 'campaign',
]);

export function normalizeUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        const params = new URLSearchParams(parsed.search);
        for (const key of [...params.keys()]) {
            if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
        }
        const search = params.toString();
        parsed.search = search ? `?${search}` : '';
        let normalized = parsed.toString();
        if (normalized.endsWith('/') && parsed.pathname !== '/') {
            normalized = normalized.slice(0, -1);
        }
        return normalized.toLowerCase();
    } catch {
        return String(url).toLowerCase().split('#')[0].split('?')[0];
    }
}

export function extractHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
}

export function isSameNormalizedUrl(a, b) {
    return normalizeUrl(a) === normalizeUrl(b);
}
