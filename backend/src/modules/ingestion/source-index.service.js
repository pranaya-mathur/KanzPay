import { findSourcesByStatus } from '../sources/sources.repository.js';

const STATUS_PRIORITY = { approved: 3, probation: 2, rejected: 1 };

/**
 * Build source index preferring approved over probation over rejected per sourceType.
 */
export async function buildSourceIndex() {
    const index = new Map();
    for (const status of ['approved', 'probation', 'rejected']) {
        const sources = await findSourcesByStatus(status);
        for (const source of sources) {
            const existing = index.get(source.sourceType);
            const priority = STATUS_PRIORITY[status] || 0;
            const existingPriority = existing ? (STATUS_PRIORITY[existing.status] || 0) : 0;
            if (!existing || priority > existingPriority) {
                index.set(source.sourceType, source);
            }
        }
    }
    return index;
}
