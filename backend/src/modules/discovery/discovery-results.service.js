import fs from 'fs/promises';
import config from '../../config.js';
import logger from '../../shared/utils/logger.js';

export async function loadDiscoveryResults(filePath = config.discoveryDataPath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.debug('No discovery results file found', { filePath });
            return { results: [] };
        }
        throw err;
    }
}

export function flattenDiscoveryResults(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.seeds)) return data.seeds;
    return [];
}
