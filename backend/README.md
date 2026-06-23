# KanzPay Backend

Production ingestion, confidence scoring, quarantine routing, deduplication, freshness tracking, and query APIs for normalized offer data produced by the KanzPay crawler.

## Architecture

```
storage/datasets/default/*.json
            │
            ▼
┌───────────────────────────┐
│ ingest-crawl-results.job  │
└─────────────┬─────────────┘
              │
   1. Parse + validate raw JSON (Zod)
   2. Store raw_crawl_events (all valid crawl rows)
   3. Normalize fields
   4. Score confidence (backend layer)
   5. Quality gate
   6. Route: canonical offers OR quarantine_records
   7. Canonical key + dedupe upsert (accepted only)
   8. Snapshot on material change
   9. Record ingestion_runs stats
              │
     ┌────────┴────────┐
     ▼                 ▼
 offers (canonical)   quarantine_records
     │                 (rejected + low-confidence)
     ▼
 GET /offers APIs     GET /quarantine APIs
```

Three separate stores — no mixing:
- `raw_crawl_events` — immutable crawl payloads
- `offers` — canonical, confidence ≥ floor
- `quarantine_records` — gate failures, invalid schema, confidence < floor

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (Docker Compose provided on port **5435**)

## Setup

```bash
cd backend
cp .env.example .env
npm install
docker compose up -d
npm run migrate
```

## Ingest crawl output

After running the crawler at the repo root (`npm start`), ingest dataset files:

```bash
cd backend
npm run ingest
```

Dry run (counts only, no DB writes):
```bash
node src/jobs/ingest-crawl-results.job.js --dry-run
```

## Start API server

```bash
npm start
```

Server runs on `http://localhost:5436` by default (5436 avoids conflict with other local stacks on 3000) and auto-applies SQL migrations on boot.

## Full pipeline (crawl → ingest → validate)

```bash
# After crawler run (local storage)
npm run pipeline:ingest

# With Apify run sync (requires APIFY_TOKEN)
node src/jobs/run-ingestion-pipeline.job.js --apify-run=YOUR_RUN_ID

# Local end-to-end from repo root
../scripts/run-local-pipeline.sh
```

Discovery review candidates:
```bash
npm run review-discovery
# GET /discovery/candidates
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/offers` | List canonical offers |
| GET | `/offers/search?q=` | Search title/description/merchant/bank |
| GET | `/offers/fresh` | Fresh, valid-now offers |
| GET | `/offers/by-merchant/:merchant` | Filter by merchant |
| GET | `/offers/by-bank/:bank` | Filter by bank |
| GET | `/offers/by-card/:card` | Filter by card |
| GET | `/offers/:id` | Offer by UUID |
| GET | `/quarantine` | List quarantined records |
| GET | `/quarantine/stats` | Quarantine counts by type/source |
| GET | `/quarantine/:id` | Quarantine record by UUID |
| POST | `/quarantine/:id/promote` | Promote to canonical offers |
| POST | `/quarantine/:id/reject` | Mark review rejected |
| POST | `/quarantine/:id/replay` | Re-score without re-crawl |
| GET | `/discovery/candidates` | SERP domain candidates for review |
| POST | `/ingestion/runs` | Trigger ingestion job |
| GET | `/ingestion/runs/:id` | Ingestion run status + stats |
| POST | `/webhooks/apify` | Apify success → sync + ingest |

### Offer query parameters

- `sourceType`, `merchant`, `bank`, `card`, `couponCode`, `category`
- `validNow=true` — exclude expired offers
- `freshnessStatus` — `fresh` or `stale` (canonical only)
- `confidenceMin`, `confidenceMax` — confidence range filter
- `discoveryQuery` — trace Google discovery provenance
- `sort` — `updatedAt`, `confidence`, `lastSeenAt`
- `order` — `asc` / `desc`
- `page`, `limit` (max 100)

### Quarantine query parameters

- `runId`, `sourceType`, `sourceUrl`, `discoveryQuery`
- `confidenceMin`, `confidenceMax`, `q`
- `sort` — `createdAt`, `confidence`
- `page`, `limit`

## Confidence, quality gate & quarantine

- Backend recomputes confidence using source reliability, page depth, field completeness, parser signal, and penalties for FAB category headers / generic Visa detail shells.
- Default canonical floor: **0.4** (`CONFIDENCE_FLOOR` env).

| Outcome | Destination |
|---------|-------------|
| Invalid schema | `quarantine_records` (`invalid_schema`) + raw event |
| Rejected registry source | `quarantine_records` (`rejected_source`) |
| Weak discovery offer | `quarantine_records` (`discovery_review`) |
| Strong discovery offer | `offers` (hybrid auto-accept) |
| Quality gate failure | `quarantine_records` (reasons stored) |
| Confidence < floor | `quarantine_records` (`below_confidence_floor`) |
| Confidence ≥ floor | `offers` (`freshnessStatus = fresh`) |

Probation sources (Visa, FAB) use **strict quality gates** aligned with the crawler.

Nothing is silently dropped — every non-accepted record is stored in quarantine with `rawPayloadJson`, `normalizedPayloadJson`, and `rejectionReasonsJson`.

## Freshness

```bash
npm run refresh
```

Marks canonical offers `stale` when `last_seen_at` exceeds source-specific thresholds (coupon feeds: 7 days, merchant: 10 days, default: 14 days).

## Discovery metadata

`discoveryQuery`, `discoverySource`, and `serpRank` are preserved on raw events, canonical offers, and quarantine records when present in crawl output or `DISCOVERY_RESULTS.json`.

## Tests

```bash
npm test
```

Unit tests cover URL normalization, canonical keys, confidence scoring, quality gate, **quarantine routing**, deduplication, freshness, snapshots, query validation, and **source registry**.

See [SOURCES.md](./SOURCES.md) for the source approval workflow.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://kanzpay:kanzpay@localhost:5435/kanzpay` | Postgres connection |
| `CRAWL_DATA_DIR` | `../storage/datasets/default` | Crawler dataset path |
| `DISCOVERY_DATA_PATH` | `../storage/.../DISCOVERY_RESULTS.json` | SERP metadata |
| `RUN_SUMMARY_PATH` | `../storage/.../RUN_SUMMARY.json` | Crawler quality metrics |
| `APIFY_TOKEN` | — | Pull dataset/KV from Apify cloud |
| `APIFY_WEBHOOK_SECRET` | — | Verify `POST /webhooks/apify` |
| `CONFIDENCE_FLOOR` | `0.4` | Canonical vs quarantine threshold |
| `STALE_AFTER_DAYS` | `14` | Default stale window |
| `PORT` | `5436` | API port |

## Scripts

| npm script | Purpose |
|------------|---------|
| `npm run ingest` | Ingest crawl JSON |
| `npm run pipeline:ingest` | Ingest + refresh + validate sources |
| `npm run review-discovery` | Build `DISCOVERY_CANDIDATES.json` |
