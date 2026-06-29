#!/usr/bin/env node
/**
 * Export KanzPay databases to CSV.
 *
 * Default (hybrid): live where configured + JSON fallback for Supabase DBs
 *   node scripts/export-databases-to-csv.js
 *
 * JSON snapshot only:
 *   node scripts/export-databases-to-csv.js --from-json
 *
 * Live PostgreSQL only (no JSON fallback):
 *   node scripts/export-databases-to-csv.js --live-only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const DEFAULT_JSON = path.join(projectRoot, 'db_full_extract.json');
const DEFAULT_OUT = path.join(projectRoot, 'csv_exports');

const JSON_DB_KEYS = ['kanzpay_app', 'users', 'safegold'];

const DB_TARGETS = [
    {
        key: 'kanzpay_app',
        envVar: 'KANZPAY_APP_DB_URL',
        fallbackEnvVar: 'SUPABASE_KANZPAY_APP_DB_URL',
        schema: 'public',
    },
    {
        key: 'users',
        envVar: 'SUPABASE_USERS_DB_URL',
        schema: 'public',
    },
    {
        key: 'safegold',
        envVar: 'SUPABASE_SAFEGOLD_DB_URL',
        fallbackEnvVar: 'SUPABASE_USERS_DB_URL',
        schema: 'safegold',
    },
    {
        key: 'local_offers',
        envVar: 'DATABASE_URL',
        schema: 'public',
        optional: true,
    },
];

function parseArgs(argv) {
    const args = { jsonOnly: false, liveOnly: false, jsonPath: DEFAULT_JSON, outDir: DEFAULT_OUT };
    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--from-json') {
            args.jsonOnly = true;
            if (argv[i + 1] && !argv[i + 1].startsWith('-')) args.jsonPath = path.resolve(argv[++i]);
        } else if (arg === '--live-only') {
            args.liveOnly = true;
        } else if (arg === '--out') {
            args.outDir = path.resolve(argv[++i]);
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        }
    }
    return args;
}

function printHelp() {
    console.log(`Usage:
  node scripts/export-databases-to-csv.js [--from-json [path] | --live-only] [--out dir]

Modes (default = hybrid: live + JSON fallback for Supabase):
  --from-json   Supabase snapshot only (db_full_extract.json)
  --live-only   PostgreSQL only, no JSON fallback

Output: <out>/<database>/<table>.csv plus _manifest.csv
`);
}

function loadEnv() {
    const envPath = path.join(projectRoot, 'backend', '.env');
    if (!fs.existsSync(envPath)) return;
    try {
        const dotenv = require(path.join(projectRoot, 'backend', 'node_modules', 'dotenv'));
        dotenv.config({ path: envPath });
    } catch {
        const raw = fs.readFileSync(envPath, 'utf8');
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim();
            if (!process.env[key]) process.env[key] = val;
        }
    }
}

function resolveDbUrl(target) {
    const url = process.env[target.envVar] || (target.fallbackEnvVar && process.env[target.fallbackEnvVar]);
    if (!url || url.includes('[PASSWORD]')) return null;
    return url;
}

function serializeCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if (value instanceof Date) return value.toISOString();
        return JSON.stringify(value);
    }
    return String(value);
}

function toCsvRow(values) {
    return values.map((v) => {
        const s = serializeCell(v);
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    }).join(',');
}

function writeCsv(filePath, rows) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!rows.length) {
        fs.writeFileSync(filePath, '');
        return 0;
    }
    const headers = Object.keys(rows[0]);
    const lines = [toCsvRow(headers)];
    for (const row of rows) {
        lines.push(toCsvRow(headers.map((h) => row[h])));
    }
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
    return rows.length;
}

function safeTableFileName(tableName) {
    return tableName.replace(/\./g, '_').replace(/"/g, '');
}

function exportFromJson(jsonPath, outDir, { onlyDbs = null } = {}) {
    if (!fs.existsSync(jsonPath)) {
        throw new Error(`JSON file not found: ${jsonPath}`);
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const manifest = [];
    const dbKeyMap = {
        kanzpay_app_db: 'kanzpay_app',
        users_db: 'users',
        safegold_db: 'safegold',
    };

    for (const [section, tables] of Object.entries(data)) {
        if (section === 'meta' || typeof tables !== 'object') continue;
        const dbKey = dbKeyMap[section] || section.replace(/_db$/, '');
        if (onlyDbs && !onlyDbs.includes(dbKey)) continue;
        for (const [tableName, tableData] of Object.entries(tables)) {
            const rows = tableData?.rows ?? [];
            const error = tableData?.error ?? null;
            const fileName = `${safeTableFileName(tableName)}.csv`;
            const filePath = path.join(outDir, dbKey, fileName);
            const rowCount = error ? 0 : writeCsv(filePath, rows);
            manifest.push({
                database: dbKey,
                table: tableName,
                rows: rowCount,
                source: 'json',
                error: error || '',
                file: path.relative(outDir, filePath),
            });
            const status = error ? `ERROR: ${error}` : `${rowCount} rows`;
            console.log(`  ${dbKey}/${fileName} — ${status}`);
        }
    }
    return manifest;
}

async function exportFromLive(outDir) {
    const pg = require(path.join(projectRoot, 'backend', 'node_modules', 'pg'));
    const { Pool } = pg;
    const manifest = [];

    for (const target of DB_TARGETS) {
        const url = resolveDbUrl(target);
        if (!url) {
            if (!target.optional) {
                console.log(`Skipping ${target.key}: set ${target.envVar} in backend/.env`);
            }
            continue;
        }

        const pool = new Pool({
            connectionString: url,
            ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
            max: 3,
        });

        try {
            const tablesRes = await pool.query(
                `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
                [target.schema],
            );
            console.log(`\n${target.key} (${target.schema}): ${tablesRes.rows.length} tables`);

            for (const { tablename } of tablesRes.rows) {
                const qualified = target.schema === 'public' ? `"${tablename}"` : `"${target.schema}"."${tablename}"`;
                const fileName = `${safeTableFileName(tablename)}.csv`;
                const filePath = path.join(outDir, target.key, fileName);
                let rowCount = 0;
                let error = '';

                try {
                    const result = await pool.query(`SELECT * FROM ${qualified}`);
                    rowCount = writeCsv(filePath, result.rows);
                    console.log(`  ${fileName} — ${rowCount} rows`);
                } catch (err) {
                    error = err.message;
                    console.log(`  ${fileName} — ERROR: ${error}`);
                }

                manifest.push({
                    database: target.key,
                    table: target.schema === 'public' ? tablename : `${target.schema}.${tablename}`,
                    rows: rowCount,
                    source: 'live',
                    error,
                    file: path.relative(outDir, filePath),
                });
            }
        } finally {
            await pool.end();
        }
    }

    return manifest;
}

function writeManifest(outDir, manifest) {
    const headers = ['database', 'table', 'rows', 'source', 'error', 'file'];
    const rows = manifest.map((m) => ({
        database: m.database,
        table: m.table,
        rows: m.rows,
        source: m.source,
        error: m.error,
        file: m.file,
    }));
    const manifestPath = path.join(outDir, '_manifest.csv');
    writeCsv(manifestPath, rows);
    return manifestPath;
}

async function exportHybrid(outDir, jsonPath) {
    const manifest = [];
    const liveDbs = new Set();

    console.log(`Exporting live databases → ${outDir}`);
    const liveManifest = await exportFromLive(outDir);
    for (const entry of liveManifest) liveDbs.add(entry.database);
    manifest.push(...liveManifest);

    const jsonFallbackDbs = JSON_DB_KEYS.filter((db) => !liveDbs.has(db));
    if (jsonFallbackDbs.length) {
        if (!fs.existsSync(jsonPath)) {
            console.log(`\nNo JSON snapshot at ${jsonPath} — skipping fallback for: ${jsonFallbackDbs.join(', ')}`);
        } else {
            console.log(`\nJSON fallback (${path.basename(jsonPath)}) for: ${jsonFallbackDbs.join(', ')}`);
            manifest.push(...exportFromJson(jsonPath, outDir, { onlyDbs: jsonFallbackDbs }));
        }
    }

    return { manifest, mode: liveManifest.length ? 'hybrid' : 'json' };
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }

    loadEnv();
    fs.mkdirSync(args.outDir, { recursive: true });

    let manifest;
    let mode;

    if (args.jsonOnly) {
        mode = 'json';
        console.log(`Exporting from ${args.jsonPath} → ${args.outDir}`);
        manifest = exportFromJson(args.jsonPath, args.outDir);
    } else if (args.liveOnly) {
        mode = 'live';
        console.log(`Exporting live databases → ${args.outDir}`);
        manifest = await exportFromLive(args.outDir);
    } else {
        const result = await exportHybrid(args.outDir, args.jsonPath);
        manifest = result.manifest;
        mode = result.mode;
    }

    const manifestPath = writeManifest(args.outDir, manifest);
    const totalRows = manifest.reduce((sum, m) => sum + (m.rows || 0), 0);
    const tablesWithData = manifest.filter((m) => m.rows > 0).length;
    const errors = manifest.filter((m) => m.error).length;

    console.log(`\nDone (${mode}): ${tablesWithData} tables with data, ${totalRows} total rows, ${errors} errors`);
    console.log(`Manifest: ${manifestPath}`);
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
