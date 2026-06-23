import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadDiscoveryResults, flattenDiscoveryResults } from '../discovery/discovery-results.service.js';
import { extractHostname } from '../../shared/utils/url-normalize.js';
import config from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(config.projectRoot, 'storage/key_value_stores/default/DISCOVERY_CANDIDATES.json');

export async function buildDiscoveryCandidates(discoveryDataPath = config.discoveryDataPath) {
    const data = await loadDiscoveryResults(discoveryDataPath);
    const results = flattenDiscoveryResults(data);
    const byHost = new Map();

    for (const item of results) {
        const host = extractHostname(item.url);
        if (!host) continue;
        if (!byHost.has(host)) {
            byHost.set(host, {
                hostname: host,
                urls: [],
                queries: new Set(),
                hitCount: 0,
            });
        }
        const bucket = byHost.get(host);
        bucket.hitCount += 1;
        bucket.urls.push(item.url);
        if (item.discoveryQuery || item.query) bucket.queries.add(item.discoveryQuery || item.query);
    }

    const candidates = [...byHost.values()].map((b) => ({
        hostname: b.hostname,
        hitCount: b.hitCount,
        sampleUrls: b.urls.slice(0, 5),
        queries: [...b.queries],
        status: 'pending_review',
    })).sort((a, b) => b.hitCount - a.hitCount);

    const payload = {
        generatedAt: new Date().toISOString(),
        candidateCount: candidates.length,
        candidates,
    };

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
    return payload;
}

export async function getDiscoveryCandidates() {
    if (fs.existsSync(OUT_PATH)) {
        return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    }
    return buildDiscoveryCandidates();
}
