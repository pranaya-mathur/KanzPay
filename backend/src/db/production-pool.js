import pg from 'pg';
import config from '../config.js';
import { logger } from '../shared/utils/logger.js';

const { Pool } = pg;

let usersPool = null;

export function getProductionUsersPool() {
    if (!config.supabaseUsersDbUrl) return null;
    if (!usersPool) {
        usersPool = new Pool({
            connectionString: config.supabaseUsersDbUrl,
            max: 5,
            idleTimeoutMillis: 30000,
            ssl: { rejectUnauthorized: false },
        });
        usersPool.on('error', (err) => {
            logger.error('Production Users DB pool error', { error: err.message });
        });
    }
    return usersPool;
}

export async function productionQuery(text, params = []) {
    const pool = getProductionUsersPool();
    if (!pool) throw new Error('Production DB not configured. Set SUPABASE_USERS_DB_URL in .env');
    return pool.query(text, params);
}

export function isProductionConnected() {
    return !!config.supabaseUsersDbUrl;
}

export async function closeProductionPool() {
    if (usersPool) {
        await usersPool.end();
        usersPool = null;
    }
}
