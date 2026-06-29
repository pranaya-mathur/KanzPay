# KanzPay Backend

Production ingestion, confidence scoring, quarantine routing, deduplication, freshness tracking, **offer validity & LLM enrichment**, payment rules engine, and query APIs for normalized offer data produced by the KanzPay crawler.

## Architecture

### Ingestion pipeline

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

### Validity, enrichment & checkout

```
offers (canonical)
     │
     ├─ Re-ingest merge ── parser dates win; preserve LLM fields when llm_enriched_at >= last_seen_at
     │
     ├─ enrich-offers.job (async, ENRICHMENT_ENABLED)
     │     ├─ LLM fills valid_to, min_spend, cap_value, etc.
     │     ├─ Blocking flags (generic_page, not_an_offer, expired) + confidence ≥ 0.7 → quarantine (llm_review_required)
     │     └─ Records ingestion_runs run_type = llm_enrich
     │
     ├─ audit-validity.job ── SQL backfill + optional LLM sample
     │
     └─ POST /payment/recommend or GET /checkout/sessions/:id/recommend
           1. Fetch fresh, valid-now offers
           2. Rules engine (deterministic discount math + validity gates)
           3. Eligibility reviewer (advisory caveats; optional LLM for high-risk)
           4. AI recommendation layer (ranks combinations; does not override payAmount)
```

Three separate stores — no mixing:
- `raw_crawl_events` — immutable crawl payloads
- `offers` — canonical, confidence ≥ floor
- `quarantine_records` — gate failures, invalid schema, confidence < floor, **LLM review**

**Design principle:** The rules engine owns payable amounts. LLM enrichment fills missing fields and adds checkout caveats only — it never computes discounts.

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
| POST | `/checkout/sessions` | Create checkout session (auth) |
| GET | `/checkout/sessions/:id/recommend` | Payment recommendation for session (auth) |
| POST | `/payment/recommend` | Payment recommendation (normalization → rules → AI) |
| GET | `/payment/health` | Payment module health |
| POST | `/ingestion/runs` | Trigger ingestion job |
| GET | `/ingestion/runs/:id` | Ingestion run status + stats |
| POST | `/webhooks/apify` | Apify success → sync + ingest |

### Offer query parameters

- `sourceType`, `merchant`, `bank`, `card`, `couponCode`, `category`
- `validNow=true` — exclude expired offers and `validity_status` expired/not_yet_active
- `validityStatus` — `active`, `expired`, `not_yet_active`, `unknown`
- `verifyRequired` — `true` / `false`
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
| LLM blocking flags (confidence ≥ 0.7) | `quarantine_records` (`llm_review_required`) + offer marked `stale` |
| Confidence ≥ floor | `offers` (`freshnessStatus = fresh`) |

Probation sources (Visa, FAB) use **strict quality gates** aligned with the crawler.

Nothing is silently dropped — every non-accepted record is stored in quarantine with `rawPayloadJson`, `normalizedPayloadJson`, and `rejectionReasonsJson`.

## Freshness

```bash
npm run refresh
```

Marks canonical offers `stale` when `last_seen_at` exceeds source-specific thresholds (coupon feeds: 7 days, merchant: 10 days, default: 14 days). Also runs a SQL validity audit (expired dates, `verify_required` backfill).

## Offer validity & LLM enrichment

Migration `014_offer_validity_enrichment.sql` adds `validity_status`, `verify_required`, `llm_enriched_at`, `llm_confidence`, and `llm_enrichment_json` to the `offers` table.

Three concepts work together:

| Field | Meaning |
|-------|---------|
| `freshness_status` | Crawl recency (`fresh` / `stale`) |
| `validity_status` | Date-based eligibility (`active` / `expired` / `not_yet_active` / `unknown`) |
| `verify_required` | Needs human/bank verification before checkout use |

### Verify rule

`verify_required = true` when:

- `valid_to` is missing — **always**, regardless of LLM confidence
- **or** LLM confidence is below 0.65 (even when `valid_to` is set)

Offers without an end date get `validity_status = unknown` and are excluded from checkout discounts.

### Re-ingest merge

When a crawler re-sees an existing offer (`upsertOffer` update path):

1. Parser-supplied dates and fields win when present.
2. If the parser omits dates and `llm_enriched_at >= last_seen_at`, LLM-filled `valid_to`, `valid_from`, `min_spend`, `cap_value`, `card_name`, `terms_url`, and `coupon_code` are preserved.
3. `llm_enriched_at` and `llm_enrichment_json` are **not** reset on ingest update.
4. `verify_required` and `validity_status` are recomputed from merged dates + stored LLM confidence.

Implemented in `src/modules/ingestion/ingest-validity-merge.service.js`.

### Rules engine checkout gates

Before applying a card-offer discount, `evaluateCardOfferEligibility()` rejects offers with:

| Condition | Rejection reason |
|-----------|------------------|
| `validity_status = expired` | `offer_expired` |
| `validity_status = not_yet_active` | `offer_not_yet_active` |
| `validity_status = unknown` | `offer_validity_unknown` |
| `verify_required = true` | `offer_verify_required` |
| `valid_from` in the future | `offer_not_yet_active` |
| `freshness_status = stale` | `stale_offer` |

Wallet and crawled coupons are also rejected when `expiresAt` is in the past.

### Eligibility reviewer (advisory)

At checkout, `reviewEligibility()` adds caveats (not discount changes) for borderline cases:

- Card-offer caveats only when the **applied** offer has `verify_required` or `validity_status = unknown`
- Low-confidence warnings scoped to offers **in the recommended combination**, not all fetched offers
- Optional LLM review (`reviewEligibilityWithLlm`) when deterministic risk is `high`, or `medium` with a `verify_required` offer/coupon in the combination

Response field: `eligibilityReview` with `risk`, `caveats`, and `suggestedAction`.

### Jobs

```bash
# Async LLM enrichment (requires OPENAI_API_KEY + ENRICHMENT_ENABLED=true)
npm run enrich-offers
npm run enrich-offers -- --force --limit=200

# Validity audit (SQL + optional LLM sample)
npm run audit-validity
npm run audit-validity -- --sample=0   # SQL only

# Full pipeline with enrichment when enabled
ENRICHMENT_ENABLED=true npm run pipeline:ingest
```

Enrichment batch stats include `processed`, `enriched`, `skipped`, `failed`, `flagged`, and `quarantined`.

Blocking LLM flags (`generic_page`, `not_an_offer`, `expired`) with confidence ≥ 0.7 create `llm_review_required` quarantine records and mark the canonical offer `stale` (offer is kept for audit; checkout excludes it via validity/freshness flags).

## Discovery metadata

`discoveryQuery`, `discoverySource`, and `serpRank` are preserved on raw events, canonical offers, and quarantine records when present in crawl output or `DISCOVERY_RESULTS.json`.

## Tests

```bash
npm test
```

**95 unit tests** covering:

- URL normalization, canonical keys, confidence scoring, quality gate, quarantine routing
- Deduplication, freshness, snapshots, query validation, source registry
- **Validity:** `deriveValidityStatus`, `shouldRequireVerification`, ingest-validity merge
- **Enrichment:** field merge, blocking flags, OpenAI retry (429/503)
- **Checkout:** rules-engine validity gates, coupon expiry, eligibility reviewer, `resolveVerifyRequired`

See [SOURCES.md](./SOURCES.md) for the source approval workflow. See [../docs/WORKFLOW.md](../docs/WORKFLOW.md) for the full system workflow.

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
| `OPENAI_API_KEY` | — | Required for AI payment recommendations and LLM enrichment |
| `OPENAI_MODEL` | `gpt-4o` | Model for payment recommendation layer |
| `ENRICHMENT_ENABLED` | `false` | Run LLM enrichment after ingest pipeline |
| `OPENAI_ENRICHMENT_MODEL` | `gpt-4o-mini` | Model for offer field extraction |
| `ENRICHMENT_BATCH_SIZE` | `100` | Max offers per enrichment run |
| `ENRICHMENT_MIN_CONFIDENCE_AUTO` | `0.85` | Auto-apply LLM fields with evidence |
| `ENRICHMENT_VERIFY_THRESHOLD` | `0.65` | Below → `verify_required` |
| `ENRICHMENT_MAX_RETRIES` | `3` | OpenAI 429/503/timeout retry attempts |
| `ENRICHMENT_DELAY_MS` | `200` | Delay between enrichment API calls |
| `ELIGIBILITY_LLM_REVIEW_ENABLED` | `true` when `OPENAI_API_KEY` set | Kill-switch for checkout LLM eligibility review |
| `AUDIT_LLM_SAMPLE_SIZE` | `50` | LLM re-check sample in audit job |
| `PORT` | `5436` | API port |

## Scripts

| npm script | Purpose |
|------------|---------|
| `npm run ingest` | Ingest crawl JSON |
| `npm run pipeline:ingest` | Ingest + refresh + validate sources (+ enrich/audit when enabled) |
| `npm run enrich-offers` | Async LLM offer field enrichment batch |
| `npm run audit-validity` | SQL validity audit + optional LLM sample |
| `npm run review-discovery` | Build `DISCOVERY_CANDIDATES.json` |
