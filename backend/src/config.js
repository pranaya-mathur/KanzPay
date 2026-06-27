import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

export const config = {
    port: Number(process.env.PORT || 3000),
    databaseUrl: process.env.DATABASE_URL || 'postgresql://kanzpay:kanzpay@localhost:5435/kanzpay',
    crawlDataDir: path.resolve(backendRoot, process.env.CRAWL_DATA_DIR || '../storage/datasets/default'),
    discoveryDataPath: path.resolve(backendRoot, process.env.DISCOVERY_DATA_PATH || '../storage/key_value_stores/default/DISCOVERY_RESULTS.json'),
    runSummaryPath: path.resolve(backendRoot, process.env.RUN_SUMMARY_PATH || '../storage/key_value_stores/default/RUN_SUMMARY.json'),
    apifyToken: process.env.APIFY_TOKEN || null,
    apifyWebhookSecret: process.env.APIFY_WEBHOOK_SECRET || null,
    apifyDefaultDatasetDir: path.resolve(projectRoot, process.env.APIFY_DATASET_DIR || 'storage/datasets/default'),
    confidenceFloor: Number(process.env.CONFIDENCE_FLOOR || 0.4),
    staleAfterDays: Number(process.env.STALE_AFTER_DAYS || 14),
    logLevel: process.env.LOG_LEVEL || 'info',
    // OpenAI / AI recommendation layer
    openaiApiKey: process.env.OPENAI_API_KEY || null,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    jwtSecret: process.env.JWT_SECRET || 'kanzpay-dev-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    supabaseUsersDbUrl: process.env.SUPABASE_USERS_DB_URL || null,
    supabaseSafegoldDbUrl: process.env.SUPABASE_SAFEGOLD_DB_URL || null,
    projectRoot,
    backendRoot,
    sourceStaleDays: {
        emiratesNbd: Number(process.env.STALE_ENBD_DAYS || 14),
        visaUAE: Number(process.env.STALE_VISA_DAYS || 14),
        fab: Number(process.env.STALE_FAB_DAYS || 14),
        couponFeed: Number(process.env.STALE_COUPON_DAYS || 7),
        merchant: Number(process.env.STALE_MERCHANT_DAYS || 10),
        generic: Number(process.env.STALE_GENERIC_DAYS || 14),
    },
};

export default config;
