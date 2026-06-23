import pg from 'pg';
import config from '../config.js';

const { Pool } = pg;

let pool;

export function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: config.databaseUrl,
            max: 20,
            idleTimeoutMillis: 30000,
        });
    }
    return pool;
}

export async function query(text, params = []) {
    return getPool().query(text, params);
}

export async function withTransaction(fn) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
