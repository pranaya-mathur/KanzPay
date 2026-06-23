import fs from 'fs';
import path from 'path';
import config from '../../config.js';
import { buildCrawlPlan } from './crawl-plan.service.js';
import logger from '../../shared/utils/logger.js';

/**
 * Generate Apify-compatible startUrls from the source registry
 * and optionally write to the crawler INPUT path.
 */
export async function generateCrawlTargets(options = {}) {
    const plan = await buildCrawlPlan(options);

    const startUrls = plan.targets.map((t) => ({
        url: t.url,
        userData: t.userData,
    }));

    const input = {
        startUrls,
        discoveryEnabled: false,
        crawlerMode: plan.crawlerMode,
        maxDepth: plan.maxDepth,
        maxRequestsPerCrawl: options.maxRequestsPerCrawl ?? 60,
        allowedDomains: plan.targets.map((t) => t.constraints?.allowedPaths?.length ? null : null)
            .filter(Boolean),
        sourceRegistryPlan: {
            generatedAt: plan.generatedAt,
            targets: plan.targets.map((t) => ({
                sourceId: t.sourceId,
                sourceName: t.sourceName,
                status: t.status,
                priority: t.priority,
            })),
        },
    };

    // Derive allowed domains from registry targets
    const domains = [...new Set(plan.targets.map((t) => {
        try { return new URL(t.url).hostname.replace(/^www\./, ''); } catch { return null; }
    }).filter(Boolean))];
    input.allowedDomains = domains;

    if (options.writeInput) {
        const outPath = options.outputPath
            || path.resolve(config.projectRoot, 'storage/key_value_stores/default/INPUT.registry.json');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(input, null, 2));
        logger.info('Crawl targets written', { path: outPath, count: startUrls.length });
    }

    return { plan, input, startUrls };
}

export async function exportCrawlPlanJson(outputPath) {
    return generateCrawlTargets({ writeInput: true, outputPath });
}
