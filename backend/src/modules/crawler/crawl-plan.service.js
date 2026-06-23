import * as repo from '../sources/sources.repository.js';
import { canCrawlSource, getCrawlConstraints } from '../sources/source-policy.service.js';
import logger from '../../shared/utils/logger.js';

/**
 * Build crawl plan from source registry.
 * Approved sources: full auto crawl.
 * Probation sources: included with stricter constraints.
 * Rejected sources: excluded.
 */
export async function buildCrawlPlan(options = {}) {
    const includeProbation = options.includeProbation !== false;
    const statuses = includeProbation ? ['approved', 'probation'] : ['approved'];

    const targets = [];
    for (const status of statuses) {
        const sources = await repo.findSourcesByStatus(status);
        for (const source of sources) {
            if (!canCrawlSource(source)) {
                logger.debug('Source excluded from crawl plan', { domain: source.domain, status: source.status });
                continue;
            }
            const constraints = getCrawlConstraints(source);
            targets.push({
                sourceId: source.id,
                sourceName: source.sourceName,
                url: source.baseUrl,
                status: source.status,
                sourceType: source.sourceType,
                priority: source.priority,
                userData: {
                    sourceType: source.sourceType,
                    sourceId: source.id,
                    depth: 0,
                },
                constraints,
            });
        }
    }

    targets.sort((a, b) => b.priority - a.priority);

    return {
        generatedAt: new Date().toISOString(),
        targetCount: targets.length,
        statuses,
        targets,
        crawlerMode: targets.some((t) => t.constraints.crawlerMode === 'playwright') ? 'playwright' : 'auto',
        maxDepth: Math.max(...targets.map((t) => t.constraints.maxDepth ?? 1), 0),
        discoveryEnabled: false,
    };
}

export async function getApprovedDomains() {
    const sources = await repo.findSourcesByStatus('approved');
    const probation = await repo.findSourcesByStatus('probation');
    const all = [...sources, ...probation.filter(canCrawlSource)];
    return [...new Set(all.map((s) => s.domain))];
}

export function filterRejectedUrls(urls, rejectedDomains) {
    const rejected = new Set(rejectedDomains.map((d) => d.toLowerCase()));
    return urls.filter((u) => {
        const url = typeof u === 'string' ? u : u.url;
        return ![...rejected].some((d) => url.toLowerCase().includes(d));
    });
}
