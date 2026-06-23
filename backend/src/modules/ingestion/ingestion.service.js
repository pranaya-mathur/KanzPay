import fs from 'fs';
import path from 'path';
import { query, withTransaction } from '../../db/pool.js';
import config from '../../config.js';
import logger from '../../shared/utils/logger.js';
import { validateRawCrawlOffer } from '../../shared/schemas/offer.schema.js';
import { normalizeRawOffer } from './normalization.service.js';
import { scoreOfferConfidence } from './confidence-score.service.js';
import { passesQualityGate } from './quality-gate.service.js';
import { generateCanonicalKey, pickPreferredOffer, areLikelyDuplicates } from './dedupe.service.js';
import {
    attachDiscoveryMetadata, buildDiscoveryIndex,
} from './source-mapper.service.js';
import { buildSnapshotHash } from '../../shared/utils/hash.js';
import { loadDiscoveryResults } from '../discovery/discovery-results.service.js';
import { loadRunSummary } from '../crawler/run-summary.service.js';
import {
    routeIngestionRecord, routeInvalidSchema, buildQuarantineRecord, QUARANTINE_TYPES,
} from './quarantine.service.js';
import { insertQuarantineRecord } from '../quarantine/quarantine.repository.js';
import { insertFailure } from '../sources/sources.repository.js';
import { resolveConfidenceFloor, resolveStrictQualityGate } from '../sources/source-policy.service.js';
import { buildSourceIndex } from './source-index.service.js';
import { evaluateDiscoveryPolicy } from './discovery-policy.service.js';
import { hashFileContent } from './file-hash.service.js';
import { extractHostname } from '../../shared/utils/url-normalize.js';

const BATCH_SIZE = 50;

function readCrawlFiles(crawlDataDir) {
    if (!fs.existsSync(crawlDataDir)) {
        throw new Error(`Crawl data directory not found: ${crawlDataDir}`);
    }
    return fs.readdirSync(crawlDataDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(crawlDataDir, f));
}

async function createIngestionRun(input) {
    const { rows } = await query(
        `INSERT INTO ingestion_runs (run_type, input_json, status, apify_run_id, crawl_run_id)
         VALUES ($1, $2, 'running', $3, $4)
         RETURNING *`,
        [
            input.runType || 'crawl_ingest',
            JSON.stringify(input),
            input.apifyRunId || null,
            input.crawlRunId || null,
        ],
    );
    return rows[0];
}

async function finishIngestionRun(runId, status, stats, errorMessage = null) {
    await query(
        `UPDATE ingestion_runs
         SET status = $2, stats_json = $3, finished_at = NOW(), error_message = $4
         WHERE id = $1`,
        [runId, status, JSON.stringify(stats), errorMessage],
    );
}

async function isFileAlreadyProcessed(apifyRunId, contentHash) {
    if (!apifyRunId) return false;
    const { rows } = await query(
        `SELECT 1 FROM ingestion_run_files irf
         JOIN ingestion_runs ir ON ir.id = irf.run_id
         WHERE ir.apify_run_id = $1 AND irf.content_hash = $2 AND ir.status = 'completed'
         LIMIT 1`,
        [apifyRunId, contentHash],
    );
    return rows.length > 0;
}

async function recordProcessedFile(client, runId, filePath, contentHash) {
    await client.query(
        `INSERT INTO ingestion_run_files (run_id, file_path, content_hash, status)
         VALUES ($1, $2, $3, 'processed')
         ON CONFLICT (run_id, file_path) DO UPDATE SET content_hash = EXCLUDED.content_hash`,
        [runId, filePath, contentHash],
    );
}

async function insertRawEvent(client, runId, payload, sourceId = null) {
    await client.query(
        `INSERT INTO raw_crawl_events (
            run_id, source_id, source_url, discovery_query, discovery_source, serp_rank,
            source_type, parser_name, parser_reason, raw_html, raw_text,
            scraped_at, page_length, payload_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
            runId,
            sourceId,
            payload.sourceUrl || null,
            payload.discoveryQuery ?? null,
            payload.discoverySource ?? null,
            payload.serpRank ?? null,
            payload.sourceType || 'generic',
            payload.parserName ?? null,
            payload.parserReason ?? null,
            payload.rawHtml ?? null,
            payload.rawText ?? null,
            payload.scrapedAt ?? null,
            payload.pageLength ?? 0,
            JSON.stringify(payload),
        ],
    );
}

async function quarantineRecord(client, runId, rawPayload, normalized, confidence, reasons, sourceId = null, quarantineType = null) {
    const record = buildQuarantineRecord({
        runId,
        rawPayload,
        normalized,
        confidence,
        reasons,
        sourceId,
        quarantineType,
    });
    if (!dryRunGuard) await insertQuarantineRecord(client, record);
    return record;
}

let dryRunGuard = false;

function toDbOffer(offer, confidence, seenAt, sourceId = null) {
    return {
        canonicalKey: generateCanonicalKey(offer),
        sourceId,
        sourceUrl: offer.sourceUrl,
        normalizedUrl: offer.normalizedUrl,
        sourceType: offer.sourceType,
        bankName: offer.bankName,
        cardName: offer.cardName,
        merchantName: offer.merchantName,
        offerTitle: offer.offerTitle,
        offerDescription: offer.offerDescription,
        discountType: offer.discountType,
        discountValue: offer.discountValue != null ? String(offer.discountValue) : null,
        currency: offer.currency,
        minSpend: offer.minSpend,
        capValue: offer.capValue,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        couponCode: offer.couponCode,
        paymentMethods: offer.paymentMethods,
        eligibleMccList: offer.eligibleMccList,
        categories: offer.categories,
        stackable: offer.stackable,
        termsUrl: offer.termsUrl,
        confidence,
        freshnessStatus: 'fresh',
        discoveryQuery: offer.discoveryQuery,
        discoverySource: offer.discoverySource,
        serpRank: offer.serpRank,
        parserName: offer.parserName,
        crawlDepth: offer.crawlDepth,
        seenAt,
    };
}

async function findOfferByCanonicalKey(client, canonicalKey) {
    const { rows } = await client.query('SELECT * FROM offers WHERE canonical_key = $1', [canonicalKey]);
    return rows[0] || null;
}

async function findFuzzyDuplicate(client, dbOffer) {
    const host = extractHostname(dbOffer.normalizedUrl || dbOffer.sourceUrl);
    if (!host) return null;
    const { rows } = await client.query(
        `SELECT * FROM offers
         WHERE normalized_url LIKE $1
         ORDER BY last_seen_at DESC
         LIMIT 20`,
        [`%${host}%`],
    );
    const incoming = {
        ...dbOffer,
        canonicalKey: dbOffer.canonicalKey,
        confidence: dbOffer.confidence,
    };
    for (const row of rows) {
        const existing = rowToOfferModel(row);
        if (areLikelyDuplicates(existing, incoming)) return existing;
    }
    return null;
}

function rowToOfferModel(row) {
    if (!row) return null;
    return {
        id: row.id,
        canonicalKey: row.canonical_key,
        sourceUrl: row.source_url,
        normalizedUrl: row.normalized_url,
        sourceType: row.source_type,
        bankName: row.bank_name,
        cardName: row.card_name,
        merchantName: row.merchant_name,
        offerTitle: row.offer_title,
        offerDescription: row.offer_description,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        currency: row.currency,
        minSpend: row.min_spend,
        capValue: row.cap_value,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        couponCode: row.coupon_code,
        paymentMethods: row.payment_methods,
        eligibleMccList: row.eligible_mcc_list,
        categories: row.categories,
        stackable: row.stackable,
        termsUrl: row.terms_url,
        confidence: Number(row.confidence),
        freshnessStatus: row.freshness_status,
        discoveryQuery: row.discovery_query,
        discoverySource: row.discovery_source,
        serpRank: row.serp_rank,
        parserName: row.parser_name,
        crawlDepth: row.crawl_depth,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
    };
}

async function upsertOffer(client, dbOffer, stats) {
    let existing = await findOfferByCanonicalKey(client, dbOffer.canonicalKey);
    let fuzzyMerged = false;

    if (!existing) {
        const fuzzy = await findFuzzyDuplicate(client, dbOffer);
        if (fuzzy) {
            existing = await findOfferByCanonicalKey(client, fuzzy.canonicalKey);
            fuzzyMerged = true;
        }
    }

    const seenAt = dbOffer.seenAt || new Date().toISOString();

    if (!existing) {
        const { rows } = await client.query(
            `INSERT INTO offers (
                canonical_key, source_id, source_url, normalized_url, source_type, bank_name, card_name,
                merchant_name, offer_title, offer_description, discount_type, discount_value,
                currency, min_spend, cap_value, valid_from, valid_to, coupon_code,
                payment_methods, eligible_mcc_list, categories, stackable, terms_url,
                confidence, freshness_status, discovery_query, discovery_source, serp_rank,
                parser_name, crawl_depth, first_seen_at, last_seen_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
                $24,$25,$26,$27,$28,$29,$30,$31,$31
            ) RETURNING *`,
            [
                dbOffer.canonicalKey, dbOffer.sourceId, dbOffer.sourceUrl, dbOffer.normalizedUrl, dbOffer.sourceType,
                dbOffer.bankName, dbOffer.cardName, dbOffer.merchantName, dbOffer.offerTitle,
                dbOffer.offerDescription, dbOffer.discountType, dbOffer.discountValue, dbOffer.currency,
                dbOffer.minSpend, dbOffer.capValue, dbOffer.validFrom, dbOffer.validTo, dbOffer.couponCode,
                JSON.stringify(dbOffer.paymentMethods), JSON.stringify(dbOffer.eligibleMccList),
                JSON.stringify(dbOffer.categories), dbOffer.stackable, dbOffer.termsUrl,
                dbOffer.confidence, dbOffer.freshnessStatus, dbOffer.discoveryQuery,
                dbOffer.discoverySource, dbOffer.serpRank, dbOffer.parserName, dbOffer.crawlDepth, seenAt,
            ],
        );
        return { action: 'inserted', offer: rowToOfferModel(rows[0]), previous: null, fuzzyMerged };
    }

    const existingModel = rowToOfferModel(existing);
    const incomingModel = { ...existingModel, ...dbOffer, id: existing.id };
    const preferred = pickPreferredOffer(existingModel, incomingModel);
    const existingHash = buildSnapshotHash(existingModel);
    const incomingHash = buildSnapshotHash(preferred);
    const materialChanged = existingHash !== incomingHash;

    const { rows } = await client.query(
        `UPDATE offers SET
            source_url = $2, normalized_url = $3, source_type = $4, bank_name = $5, card_name = $6,
            merchant_name = $7, offer_title = $8, offer_description = $9, discount_type = $10,
            discount_value = $11, currency = $12, min_spend = $13, cap_value = $14, valid_from = $15,
            valid_to = $16, coupon_code = $17, payment_methods = $18, eligible_mcc_list = $19,
            categories = $20, stackable = $21, terms_url = $22, confidence = $23,
            freshness_status = $24, discovery_query = COALESCE($25, discovery_query),
            discovery_source = COALESCE($26, discovery_source), serp_rank = COALESCE($27, serp_rank),
            parser_name = $28, crawl_depth = $29, last_seen_at = $30, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
            existing.id,
            preferred.sourceUrl, preferred.normalizedUrl, preferred.sourceType,
            preferred.bankName, preferred.cardName, preferred.merchantName, preferred.offerTitle,
            preferred.offerDescription, preferred.discountType, preferred.discountValue,
            preferred.currency, preferred.minSpend, preferred.capValue, preferred.validFrom,
            preferred.validTo, preferred.couponCode,
            JSON.stringify(preferred.paymentMethods || dbOffer.paymentMethods),
            JSON.stringify(preferred.eligibleMccList || dbOffer.eligibleMccList),
            JSON.stringify(preferred.categories || dbOffer.categories),
            preferred.stackable ?? dbOffer.stackable, preferred.termsUrl,
            preferred.confidence ?? dbOffer.confidence, 'fresh',
            dbOffer.discoveryQuery, dbOffer.discoverySource, dbOffer.serpRank,
            preferred.parserName || dbOffer.parserName, preferred.crawlDepth ?? dbOffer.crawlDepth,
            seenAt,
        ],
    );

    if (materialChanged) {
        await client.query(
            `INSERT INTO offer_snapshots (offer_id, canonical_key, source_url, payload_json, hash)
             VALUES ($1,$2,$3,$4,$5)`,
            [existing.id, dbOffer.canonicalKey, preferred.sourceUrl, JSON.stringify(preferred), incomingHash],
        );
    }

    if (fuzzyMerged) stats.dedupeMerged = (stats.dedupeMerged || 0) + 1;

    return {
        action: materialChanged ? 'updated' : 'seen',
        offer: rowToOfferModel(rows[0]),
        previous: existingModel,
        fuzzyMerged,
    };
}

function initStats() {
    return {
        filesRead: 0,
        filesSkipped: 0,
        rawParsed: 0,
        rawStored: 0,
        accepted: 0,
        quarantined: 0,
        quarantinedQualityGate: 0,
        quarantinedLowConfidence: 0,
        quarantinedInvalidSchema: 0,
        quarantinedDiscoveryReview: 0,
        rejectedSource: 0,
        discoveryAutoAccepted: 0,
        dedupeMerged: 0,
        inserted: 0,
        updated: 0,
        seen: 0,
        byQuarantineType: {},
        bySourceType: {},
    };
}

function bumpStat(stats, bucket, key) {
    if (!stats[bucket]) stats[bucket] = {};
    stats[bucket][key] = (stats[bucket][key] || 0) + 1;
}

async function processRecord(client, run, file, rawJson, context) {
    const { stats, discoveryIndex, sourceIndex, confidenceFloor, dryRun } = context;

    let validated;
    try {
        validated = validateRawCrawlOffer(rawJson);
    } catch (err) {
        const routing = routeInvalidSchema(err.message);
        stats.quarantined += 1;
        stats.quarantinedInvalidSchema += 1;
        bumpStat(stats, 'byQuarantineType', QUARANTINE_TYPES.INVALID_SCHEMA);
        if (!dryRun) {
            await insertRawEvent(client, run.id, rawJson, null);
            stats.rawStored += 1;
            await quarantineRecord(client, run.id, rawJson, null, null, routing.reasons, null, QUARANTINE_TYPES.INVALID_SCHEMA);
        }
        return;
    }

    const withDiscovery = attachDiscoveryMetadata(validated, discoveryIndex);
    const normalized = normalizeRawOffer(withDiscovery);
    const registrySource = sourceIndex.get(normalized.sourceType) || null;

    const offerConfidence = scoreOfferConfidence(normalized, registrySource);
    normalized.confidence = offerConfidence;

    const discoveryPolicy = evaluateDiscoveryPolicy(normalized, registrySource, discoveryIndex, { confidence: offerConfidence });

    if (discoveryPolicy.action === 'quarantine') {
        stats.quarantined += 1;
        if (discoveryPolicy.quarantineType === QUARANTINE_TYPES.REJECTED_SOURCE) {
            stats.rejectedSource += 1;
        } else if (discoveryPolicy.quarantineType === QUARANTINE_TYPES.DISCOVERY_REVIEW) {
            stats.quarantinedDiscoveryReview += 1;
        }
        bumpStat(stats, 'byQuarantineType', discoveryPolicy.quarantineType);
        bumpStat(stats, 'bySourceType', normalized.sourceType);
        if (!dryRun) {
            await insertRawEvent(client, run.id, normalized, registrySource?.id ?? null);
            stats.rawStored += 1;
            await quarantineRecord(
                client, run.id, rawJson, normalized, offerConfidence,
                discoveryPolicy.reasons, registrySource?.id ?? null, discoveryPolicy.quarantineType,
            );
            if (registrySource) {
                await insertFailure(registrySource.id, null, discoveryPolicy.quarantineType, discoveryPolicy.reasons.join('; '), normalized.sourceUrl);
            }
        }
        return;
    }

    if (discoveryPolicy.discoveryAutoAccepted) {
        stats.discoveryAutoAccepted += 1;
    }

    const floor = registrySource ? resolveConfidenceFloor(registrySource) : confidenceFloor;
    const strictGate = registrySource ? resolveStrictQualityGate(registrySource) : false;
    const gate = passesQualityGate(normalized, { strictGate });
    const routing = routeIngestionRecord({ gate, confidence: offerConfidence, confidenceFloor: floor });

    if (!dryRun) {
        await insertRawEvent(client, run.id, normalized, registrySource?.id ?? null);
        stats.rawStored += 1;
    }

    if (routing.destination === 'quarantine') {
        stats.quarantined += 1;
        if (routing.quarantineType === QUARANTINE_TYPES.QUALITY_GATE) {
            stats.quarantinedQualityGate += 1;
        } else if (routing.quarantineType === QUARANTINE_TYPES.LOW_CONFIDENCE) {
            stats.quarantinedLowConfidence += 1;
        }
        bumpStat(stats, 'byQuarantineType', routing.quarantineType);
        bumpStat(stats, 'bySourceType', normalized.sourceType);
        if (!dryRun) {
            await quarantineRecord(
                client, run.id, rawJson, normalized, offerConfidence,
                routing.reasons, registrySource?.id ?? null, routing.quarantineType,
            );
            if (registrySource) {
                await insertFailure(registrySource.id, null, routing.quarantineType || 'quarantine', routing.reasons.join('; '), normalized.sourceUrl, { confidence: offerConfidence });
            }
        }
        return;
    }

    const dbOffer = toDbOffer(normalized, offerConfidence, normalized.scrapedAt, registrySource?.id ?? null);
    stats.accepted += 1;
    bumpStat(stats, 'bySourceType', normalized.sourceType);

    if (!dryRun) {
        const result = await upsertOffer(client, dbOffer, stats);
        stats[result.action] = (stats[result.action] || 0) + 1;
    } else {
        stats.inserted += 1;
    }
}

export async function ingestCrawlResults(options = {}) {
    const crawlDataDir = options.crawlDataDir || config.crawlDataDir;
    const confidenceFloor = options.confidenceFloor ?? config.confidenceFloor;
    const dryRun = !!options.dryRun;
    dryRunGuard = dryRun;

    const run = await createIngestionRun({
        runType: options.runType || 'crawl_ingest',
        crawlDataDir,
        discoveryDataPath: options.discoveryDataPath || config.discoveryDataPath,
        runSummaryPath: options.runSummaryPath || config.runSummaryPath,
        dryRun,
        confidenceFloor,
        apifyRunId: options.apifyRunId || null,
        crawlRunId: options.crawlRunId || null,
    });

    const stats = initStats();

    try {
        const discoveryResults = await loadDiscoveryResults(options.discoveryDataPath);
        const discoveryIndex = buildDiscoveryIndex(discoveryResults?.results || discoveryResults || []);
        const runSummary = await loadRunSummary(options.runSummaryPath);
        if (runSummary?.qualityBySource) {
            stats.crawlerQuality = runSummary.qualityBySource;
        }

        const files = readCrawlFiles(crawlDataDir);
        stats.filesRead = files.length;
        const sourceIndex = await buildSourceIndex();

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            await withTransaction(async (client) => {
                for (const file of batch) {
                    const contentHash = hashFileContent(file);
                    if (await isFileAlreadyProcessed(options.apifyRunId, contentHash)) {
                        stats.filesSkipped += 1;
                        continue;
                    }

                    const rawJson = JSON.parse(fs.readFileSync(file, 'utf8'));
                    stats.rawParsed += 1;

                    await processRecord(client, run, file, rawJson, {
                        stats, discoveryIndex, sourceIndex, confidenceFloor, dryRun,
                    });

                    if (!dryRun) {
                        await recordProcessedFile(client, run.id, file, contentHash);
                    }
                }
            });
        }

        try {
            const { validateSingleSource } = await import('../sources/sources.service.js');
            const { applyRunSummaryToSourceValidation } = await import('../crawler/run-summary.service.js');
            if (runSummary) {
                await applyRunSummaryToSourceValidation(runSummary, sourceIndex);
            }
            for (const source of sourceIndex.values()) {
                if (source.sourceType !== 'discovery') {
                    await validateSingleSource(source.id).catch(() => {});
                }
            }
        } catch {
            // non-fatal
        }

        await finishIngestionRun(run.id, 'completed', stats);
        logger.info('Ingestion completed', { runId: run.id, stats });
        return { runId: run.id, stats };
    } catch (err) {
        await finishIngestionRun(run.id, 'failed', stats, err.message);
        logger.error('Ingestion failed', { runId: run.id, error: err.message });
        throw err;
    } finally {
        dryRunGuard = false;
    }
}

export async function getIngestionRun(runId) {
    const { rows } = await query('SELECT * FROM ingestion_runs WHERE id = $1', [runId]);
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        id: row.id,
        runType: row.run_type,
        inputJson: row.input_json,
        statsJson: row.stats_json,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        status: row.status,
        errorMessage: row.error_message,
        apifyRunId: row.apify_run_id,
        crawlRunId: row.crawl_run_id,
    };
}

export async function startIngestionRun(input = {}) {
    return ingestCrawlResults(input);
}

export { rowToOfferModel, upsertOffer, toDbOffer };
