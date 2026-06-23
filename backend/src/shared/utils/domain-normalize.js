import { normalizeUrl } from './url-normalize.js';

/**
 * Extract registrable domain from a URL (strips www.).
 * @param {string} url
 * @returns {string|null}
 */
export function extractDomain(url) {
    if (!url) return null;
    try {
        const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
        return hostname.replace(/^www\./, '');
    } catch {
        const cleaned = String(url).toLowerCase().replace(/^www\./, '').split('/')[0];
        return cleaned || null;
    }
}

export function normalizeDomain(domain) {
    if (!domain) return null;
    return String(domain).toLowerCase().replace(/^www\./, '').trim();
}

export function domainsMatch(a, b) {
    return normalizeDomain(a) === normalizeDomain(b);
}

export function buildBaseUrl(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) return null;
    try {
        const parsed = new URL(normalized);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '') || normalized;
    } catch {
        return normalized.split('?')[0].replace(/\/$/, '');
    }
}

export function urlBelongsToDomain(url, domain) {
    const d = extractDomain(url);
    const target = normalizeDomain(domain);
    if (!d || !target) return false;
    return d === target || d.endsWith(`.${target}`);
}
