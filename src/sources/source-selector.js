import { resolveRegistry } from './source-registry.js';
import { buildStartUrlsFromRegistry, canCrawlSource } from './source-policy.js';

/**
 * Resolve crawl targets from actor input + optional registry file.
 */
export function selectCrawlSources(input = {}) {
    const useRegistry = input.useSourceRegistry !== false;
    const includeProbation = input.includeProbationSources !== false;

    if (!useRegistry && input.startUrls?.length) {
        return {
            startUrls: input.startUrls,
            registry: null,
            sourceFilter: 'manual',
        };
    }

    const registry = resolveRegistry(input);
    const registryUrls = buildStartUrlsFromRegistry(registry, { includeProbation });

    if (registryUrls.length > 0 && (useRegistry || !input.startUrls?.length)) {
        return {
            startUrls: registryUrls,
            registry,
            sourceFilter: 'registry',
            allowedDomains: registry.allowedDomains
                || [...new Set(registry.sources.map((s) => s.domain).filter(Boolean))],
        };
    }

    return {
        startUrls: input.startUrls || [],
        registry,
        sourceFilter: 'input',
    };
}

export function isUrlAllowedForSource(url, sourceType, registry) {
    const source = (registry?.sources || []).find((s) => s.sourceType === sourceType);
    if (!source) return true;
    return canCrawlSource(source);
}
