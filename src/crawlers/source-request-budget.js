/**
 * @file source-request-budget.js
 * Tracks per-source crawl request counts against registry budgets.
 */
import { getSourceRequestBudget } from '../sources/source-policy.js';
import { resolveRegistry } from '../sources/source-registry.js';

const requestCounts = new Map();

export function resetSourceBudgets() {
    requestCounts.clear();
}

export function incrementSourceBudget(sourceType) {
    if (!sourceType) return;
    requestCounts.set(sourceType, (requestCounts.get(sourceType) || 0) + 1);
}

export function isSourceBudgetExhausted(sourceType, registry = null) {
    if (!sourceType) return false;
    const reg = registry || resolveRegistry();
    const budget = getSourceRequestBudget(sourceType, reg);
    const used = requestCounts.get(sourceType) || 0;
    return used >= budget;
}

export function getSourceBudgetStats() {
    return Object.fromEntries(requestCounts.entries());
}
