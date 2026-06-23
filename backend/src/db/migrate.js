import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../migrations');

async function ensureMigrationsTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function getAppliedMigrations() {
    const { rows } = await query('SELECT filename FROM schema_migrations ORDER BY id');
    return new Set(rows.map((r) => r.filename));
}

export async function migrate() {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    const files = fs.readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        if (applied.has(file)) continue;
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        console.log(`Applying migration: ${file}`);
        await query(sql);
        await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    }
    console.log('Migrations complete');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    migrate()
        .then(() => closePool())
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
