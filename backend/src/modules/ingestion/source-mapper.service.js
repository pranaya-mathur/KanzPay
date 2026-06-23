import { normalizeUrl, extractHostname } from '../../shared/utils/url-normalize.js';

function discoveryKeys(url) {
    if (!url) return [];
    const keys = new Set();
    keys.add(url);
    const normalized = normalizeUrl(url);
    if (normalized) keys.add(normalized);
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        keys.add(`${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/$/, ''));
    } catch {
        // ignore
    }
    return [...keys];
}

export function attachDiscoveryMetadata(raw, discoveryIndex = new Map()) {
    let meta = {};
    for (const key of discoveryKeys(raw.sourceUrl)) {
        if (discoveryIndex.has(key)) {
            meta = discoveryIndex.get(key);
            break;
        }
    }
    const fromDiscovery = !!(raw.fromDiscovery || meta.discoveryQuery || raw.discoveryQuery);
    return {
        ...raw,
        fromDiscovery,
        discoveryQuery: raw.discoveryQuery ?? meta.discoveryQuery ?? null,
        discoverySource: raw.discoverySource ?? meta.discoverySource ?? null,
        serpRank: raw.serpRank ?? meta.serpRank ?? null,
    };
}

export function buildDiscoveryIndex(discoveryResults = []) {
    const index = new Map();
    const put = (url, meta) => {
        for (const key of discoveryKeys(url)) {
            if (!index.has(key)) index.set(key, meta);
        }
    };

    for (const item of discoveryResults) {
        if (!item?.url) continue;
        const meta = {
            discoveryQuery: item.query || item.discoveryQuery || null,
            discoverySource: item.source || item.discoverySource || 'google_serp',
            serpRank: item.rank ?? item.serpRank ?? null,
        };
        put(item.url, meta);
    }
    return index;
}

export function isDiscoverySourced(offer, discoveryIndex = new Map()) {
    if (offer.fromDiscovery || offer.discoveryQuery || offer.discoverySource) return true;
    for (const key of discoveryKeys(offer.sourceUrl)) {
        if (discoveryIndex.has(key)) return true;
    }
    return false;
}

export function getHostnameFromOffer(offer) {
    return extractHostname(offer.normalizedUrl || offer.sourceUrl);
}
