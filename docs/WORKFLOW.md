# KanzPay System Workflow — Detailed Documentation

KanzPay is a **UAE public offers intelligence platform** with two product areas:

**Operational layer** (crawl → ingest → store → query):

1. **Offer ingestion pipeline** — Crawl bank, Visa, merchant, and coupon pages; normalize, score, dedupe, and store canonical offers in PostgreSQL.
2. **Rules engine** — Deterministic payment math: eligibility, stacking, discount caps, and combination ranking from stored offers.

The operational stack is a **crawler (Apify Actor at repo root `src/`)** plus a **backend API + ingestion layer (`backend/`)**, connected by JSON dataset files and PostgreSQL. Crawl, ingest, quarantine, freshness, and offer queries do **not** use OpenAI.

**Mandatory AI layer** (payment recommendations only):

3. **OpenAI (GPT-4o)** — The third layer of `POST /payment/recommend`: **Normalization → Rules Engine → AI Recommendation**. OpenAI is not operational infrastructure, but it is a **required layer** in the payment recommendation pipeline — it ranks the rules-engine output and returns the final recommendation with plain-language explanation.

`OPENAI_API_KEY` must be configured for the payment recommendation API to run as designed.

---

## 1. High-Level Architecture

```mermaid
flowchart TB
    subgraph Sources["Data Sources"]
        ENBD[Emirates NBD]
        VISA[Visa UAE]
        FAB[FAB Bank]
        MERCH[Merchants / Coupons]
        SERP[Google SERP Discovery]
    end

    subgraph Crawler["Crawler (Apify Actor)"]
        P0[Phase 0: SERP Discovery]
        P1[Phase 1: Cheerio / Playwright]
        P2[Phase 2: Playwright Retry]
        DS[(storage/datasets/default/*.json)]
        KV[(KeyValueStore: INPUT, RUN_SUMMARY, DISCOVERY_RESULTS)]
    end

    subgraph Backend["Backend — operational (Node.js + PostgreSQL)"]
        ING[Ingestion Job]
        RAW[(raw_crawl_events)]
        OFF[(offers — canonical)]
        QZ[(quarantine_records)]
        SRC[(sources registry)]
        API[REST API]
        RULES[Rules Engine]
    end

    subgraph AILayer["Mandatory AI layer — payment only (not operational)"]
        OAI[OpenAI GPT-4o]
    end

    Sources --> P0
    P0 --> P1
    P1 --> P2
    P1 & P2 --> DS
    P1 & P2 --> KV

    DS --> ING
    KV --> ING
    ING --> RAW
    ING --> OFF
    ING --> QZ
    SRC --> ING
    SRC --> Crawler

    OFF --> API
    OFF --> RULES
    RULES --> OAI
    OAI --> API
    QZ --> API
    SRC --> API
```

---

## 2. End-to-End Pipeline (Happy Path)

The standard local workflow is defined in `scripts/run-local-pipeline.sh`:

| Step | Action | Output |
|------|--------|--------|
| **1** | Build crawl INPUT from source registry | `storage/key_value_stores/default/INPUT.json` |
| **2** | Run crawler (`npm start` or `apify run`) | `storage/datasets/default/*.json` + `RUN_SUMMARY.json` |
| **3** | Ingest + refresh + validate | PostgreSQL populated |
| **4** | (Optional) Review discovery candidates | `DISCOVERY_CANDIDATES.json` |

### Cloud / scheduled path

When deployed to Apify:

1. Scheduled Actor run completes → Apify webhook hits `POST /webhooks/apify`
2. Backend syncs dataset/KV artifacts from Apify
3. Ingestion runs automatically
4. Results available via REST API

---

## 3. Source Registry & Governance

Before crawling, the system decides **what to crawl** and **how strictly to ingest** via a three-tier source status model:

| Status | Crawl? | Ingest? | Examples |
|--------|--------|---------|----------|
| `approved` | Yes, normal gates | Yes | Emirates NBD |
| `probation` | Yes, stricter gates | Yes | Visa UAE, FAB |
| `rejected` | No | Quarantined | Google SERP discovery |

### Source lifecycle workflow

```
Register source → Crawl sample → Ingest → Validate metrics
    → Classify (approved / probation / rejected)
    → Generate crawl plan → Write INPUT.registry.json
    → Only approved + probation enter next crawl
```

**Key jobs/APIs:**

- `npm run crawl-plan` / `crawl-approved-sources.job.js` — builds crawler INPUT
- `POST /sources/validate` — recomputes health metrics from offers + quarantine
- `GET /sources/health/dashboard` — operational visibility

Seeded sources live in `backend/migrations/003_sources.sql` (ENBD, Visa, FAB, Google discovery).

---

## 4. Crawler Workflow (Phase-by-Phase)

Entry point: `src/main.js` (Apify Actor).

### 4.1 Input resolution

The crawler loads input from:

1. Apify Actor input, or locally `storage/key_value_stores/default/INPUT.json`
2. Optional `INPUT.registry.json` (from backend crawl plan)
3. Built-in `DEFAULT_SOURCES` in `src/sources/source-registry.js`

`selectCrawlSources()` merges registry-approved URLs with manual `startUrls`.

### 4.2 Phase 0 — Google SERP Discovery (optional)

**When:** `discoveryEnabled: true` and not in `debugUrl` mode.

- `discoveryCrawler.js` + `serpDiscovery.js` query Google for configured search terms
- Results are filtered for relevance and merged as crawl seeds
- Metadata written to `DISCOVERY_RESULTS.json` (`discoveryQuery`, `serpRank`, etc.)
- **Note:** Discovery is `rejected` in the source registry for local runs; intended for scheduled Apify runs only.

### 4.3 Phase 1 — Primary crawl

Crawler mode (`crawlerMode`):

- `cheerio` — fast HTML fetch
- `playwright` — full browser
- `auto` (default) — Cheerio first, queue JS shells for Phase 2

For each URL, `genericCrawler.js` → `processPage()`:

```
Fetch page (Cheerio or Playwright)
    → Extract raw HTML/text (PDF support via pdfExtract)
    → parser-orchestrator.js
        → detectPageType (listing | detail | category | shell | error | unknown)
        → Skip category/shell pages (debug snapshot only)
        → Route to source-specific parser (ENBD, Visa, FAB, coupon, merchant, generic)
        → validateOfferForEmit (strict gate for probation sources)
        → normalizeOffer (offerSchema.js)
    → In-crawl deduplication (OfferDeduplicator)
    → Push to Apify Dataset (one JSON row per offer)
    → Enqueue child links (depth-limited, domain-filtered)
```

**Page type handling:**

| Type | Behavior |
|------|----------|
| `listing` | Multiple offer cards extracted |
| `detail` | Single merchant offer |
| `category` | Section headers only — **skipped** |
| `shell` | JS shell / sparse body — **retry with Playwright or skip** |
| `error` | 404/oops — skipped |
| `unknown` | Generic fallback parser |

**Render strategy:**

1. Cheerio fetch (fast path)
2. Promote to Playwright when selectors missing or page typed as `shell`
3. Per-source wait selectors in `extraction/selector-fallbacks.js`

### 4.4 Phase 2 — Playwright retry

In `auto` mode, URLs flagged `needsBrowserRetry` are re-processed with Playwright after Phase 1 completes.

### 4.5 Crawler output

Each emitted offer JSON includes:

- `sourceUrl`, `sourceType`, `parserName`, `parserVersion`
- `pageType`, `confidence`, `extractionWarnings`
- Standard fields: `merchantName`, `offerTitle`, `discountType`, `discountValue`, `validTo`, `couponCode`, etc.
- Discovery metadata when applicable

**Quality tracking:** `RUN_SUMMARY.json` records per-source metrics (`pages`, `offersEmitted`, `skippedShell`, `skippedCategory`, `skippedValidation`).

Invalid pages produce **no dataset rows**; debug snapshots capture skip reasons.

---

## 5. Backend Ingestion Workflow

Entry point: `backend/src/jobs/ingest-crawl-results.job.js` → `ingestion.service.js`.

### 5.1 Ingestion run lifecycle

```
Create ingestion_runs record (status: running)
    → Load DISCOVERY_RESULTS + RUN_SUMMARY + source registry index
    → Read all *.json from crawl dataset directory
    → Process in batches of 50 (transactional)
    → Update ingestion_runs (status: completed/failed, stats_json)
```

For Apify runs, file content hashes prevent re-processing the same file twice.

### 5.2 Per-record processing pipeline

For each crawl JSON row:

```
1. Schema validation (Zod — validateRawCrawlOffer)
   └─ FAIL → quarantine (invalid_schema) + store raw_crawl_event

2. Attach discovery metadata (from DISCOVERY_RESULTS index)

3. Normalize fields (normalization.service.js)
   - URL normalization, text cleanup, date parsing, etc.

4. Resolve source from registry (source-index.service.js)

5. Discovery policy check (discovery-policy.service.js)
   - Rejected registry source → quarantine (rejected_source)
   - Unknown generic source → quarantine (discovery_review)
   - Strong discovery signals → auto-accept (hybrid path)
   - Weak discovery → quarantine (discovery_review)

6. Confidence scoring (confidence-score.service.js)
   Signals: source reliability, parser confidence, page depth/length,
            field completeness, structured text patterns
   Penalties: FAB category headers, generic Visa detail shells

7. Quality gate (quality-gate.service.js)
   Checks: minimum fields, garbage titles, error pages, thin pages,
           invalid dates, absurd values
   Probation sources use strictQualityGate

8. Route decision (quarantine.service.js)
   ┌─────────────────────────────────────────────────────────┐
   │ Gate fail        → quarantine (quality_gate_failed)     │
   │ Confidence < floor → quarantine (below_confidence_floor)│
   │ Pass both        → canonical offers table               │
   └─────────────────────────────────────────────────────────┘

9. For accepted records:
   - Generate canonical key (dedupe.service.js)
   - Fuzzy duplicate detection (same host, similar merchant/title)
   - Upsert into offers (insert | update | seen)
   - Snapshot on material change (offer_snapshots)

10. Always store raw_crawl_event for valid schema rows
```

### 5.3 Three separate data stores (never mixed)

| Store | Purpose |
|-------|---------|
| `raw_crawl_events` | Immutable audit trail of every valid crawl payload |
| `offers` | Canonical offers (confidence ≥ floor, passed gate) |
| `quarantine_records` | Everything rejected — with full payloads and reasons |

**Nothing is silently dropped.** Every non-accepted record lands in quarantine with `rawPayloadJson`, `normalizedPayloadJson`, and `rejectionReasonsJson`.

### 5.4 Confidence floor defaults

| Source | Floor |
|--------|-------|
| Default | 0.4 (`CONFIDENCE_FLOOR` env) |
| Visa UAE | 0.45 |
| FAB | 0.5 |

### 5.5 Deduplication

- **Canonical key:** Hash of normalized identifying fields (merchant, title, bank, URL, etc.)
- **Fuzzy merge:** Same hostname + `areLikelyDuplicates()` heuristic
- **Preferred offer:** On conflict, `pickPreferredOffer()` keeps richer/higher-confidence record
- **Snapshots:** `offer_snapshots` table stores historical versions when material fields change

---

## 6. Quarantine Review Workflow

Quarantined records are reviewable via API:

| Endpoint | Action |
|----------|--------|
| `GET /quarantine` | List with filters (runId, sourceType, confidence range, search) |
| `GET /quarantine/stats` | Counts by type and source |
| `GET /quarantine/:id` | Full record with payloads |
| `POST /quarantine/:id/replay` | Re-score without re-crawl (dry evaluation) |
| `POST /quarantine/:id/promote` | Manually promote to canonical `offers` if passes gate |
| `POST /quarantine/:id/reject` | Mark as review-rejected |

**Quarantine types:**

- `invalid_schema`
- `quality_gate_failed`
- `below_confidence_floor`
- `rejected_source`
- `discovery_review`

---

## 7. Freshness Management

After ingestion, `npm run refresh` (or pipeline step 3) runs `refresh-offers.job.js`:

- Canonical offers not seen within source-specific thresholds are marked `stale`
- Thresholds: coupon feeds 7 days, merchant 10 days, default 14 days (`STALE_AFTER_DAYS`)
- Re-ingestion of a stale offer sets `freshnessStatus = fresh` and updates `last_seen_at`
- API query `validNow=true` excludes expired offers (`validTo` in the past)

---

## 8. Full Pipeline Job

`run-ingestion-pipeline.job.js` orchestrates post-crawl operations:

```
1. (Optional) syncApifyRunArtifacts — pull dataset/KV from Apify cloud
2. ingestCrawlResults — full ingestion pipeline
3. refreshStaleOffers — mark old offers stale
4. refreshAllSourceHealth — recompute source validation metrics
5. (Optional) generateCrawlTargets — write next crawl INPUT
```

Triggered via:

- `npm run pipeline:ingest`
- `POST /ingestion/runs`
- Apify webhook on successful run

---

## 9. REST API Layer

Server: `backend/src/index.js` on port **5436** (default).

Routes mounted at `/` and `/api/`:

### Offers (canonical data)

- `GET /offers` — paginated list with rich filters
- `GET /offers/search?q=` — full-text search
- `GET /offers/fresh` — fresh + valid-now only
- `GET /offers/by-merchant/:merchant`, `/by-bank/:bank`, `/by-card/:card`
- `GET /offers/:id`

### Quarantine, sources, discovery, ingestion

- Quarantine CRUD + promote/reject/replay
- Source registry list/validate/status update/health dashboard
- `GET /discovery/candidates` — SERP domain candidates for human review
- `POST /ingestion/runs`, `GET /ingestion/runs/:id`

### Webhooks

- `POST /webhooks/apify` — auto-sync + ingest on Apify success

### Payment recommendation

Three mandatory layers on `POST /payment/recommend`:

| Layer | Component | Role |
|-------|-----------|------|
| 1 | `normalization.service.js` | Parse merchant, amount, cards, banks, loyalty, coupons |
| 2 | `rules-engine.service.js` | Eligibility, stacking, discount math, combination ranking |
| 3 | `ai-recommendation.service.js` | OpenAI GPT-4o — final recommendation + explanation |

- `POST /payment/recommend` — full three-layer pipeline
- `POST /payment/recommend?model=gpt-4o` — override OpenAI model
- `GET /payment/health` — payment module liveness + `aiEnabled` (requires `OPENAI_API_KEY`)

---

## 10. Payment Recommendation Workflow

The payment API runs a **three-layer pipeline** in `backend/src/modules/payment/`:

```
POST /payment/recommend
    │
    ├─ Layer 1: normalizePaymentRequest()
    │     Parse merchant, amount, cards, banks, loyalty, coupons
    │
    ├─ Layer 2: evaluatePaymentCombinations() [rules-engine.service.js]
    │     Fetch applicable offers from DB (fresh + validNow)
    │     Eligibility: loyalty, coupons, membership, card offers
    │     Stacking: loyalty → coupon → membership → card-offer
    │     Discount caps, min-spend, MCC matching
    │     Rank all valid combinations by net benefit
    │
    ├─ buildInstrumentSelection()
    │     UI-friendly instrument picker data
    │
    └─ Layer 3: getAIRecommendation() [ai-recommendation.service.js] — mandatory
          OpenAI GPT-4o receives top combinations + context
          Returns final recommendation rank, summary, highlights, caveats
```

Layers 1–2 are operational (deterministic). **Layer 3 is the mandatory AI layer** — separate from crawl/ingest, but required for the payment recommendation product.

### OpenAI integration (mandatory AI layer)

Implemented in `backend/src/modules/payment/ai-recommendation.service.js`.

| Aspect | Detail |
|--------|--------|
| **Position in pipeline** | Layer 3 — after rules engine, before API response |
| **Package** | `openai` npm SDK (`backend/package.json`) |
| **Model** | `gpt-4o` by default (`OPENAI_MODEL` env) |
| **Auth** | `OPENAI_API_KEY` — required for payment recommendations |
| **Input to model** | Top 5 rules-engine combinations + merchant context + available instruments |
| **Output** | JSON: recommended rank, plain-language summary, savings/rewards highlights, caveats |
| **Settings** | `temperature: 0.2`, `max_tokens: 512`, `response_format: json_object` |
| **Timeout** | 10 seconds |

**What OpenAI does:**

- Ranks and explains the rules-engine combinations holistically
- Produces the user-facing recommendation (summary, highlights, caveats)

**What OpenAI does not do:**

- Crawl or parse offer pages
- Score confidence or run quality gates
- Route records to quarantine
- Replace discount/eligibility math — the rules engine owns that

```mermaid
sequenceDiagram
    participant Client
    participant API as POST /payment/recommend
    participant Rules as Rules Engine
    participant DB as offers table
    participant OAI as OpenAI GPT-4o

    Client->>API: payment request (amount, cards, coupons, loyalty)
    API->>API: Layer 1 — normalize
    API->>DB: fetch applicable fresh offers
    API->>Rules: Layer 2 — evaluatePaymentCombinations()
    Rules-->>API: ranked combinations + bestCombination
    API->>OAI: Layer 3 — top 5 combos + context (chat.completions)
    OAI-->>API: JSON recommendation + explanation
    API-->>Client: aiPowered recommendation response
```

---

## 11. Database Schema Overview

| Table | Role |
|-------|------|
| `ingestion_runs` | Audit trail for each ingest job |
| `ingestion_run_files` | Per-file dedup for Apify runs |
| `raw_crawl_events` | Immutable crawl payloads |
| `offers` | Canonical offer store |
| `offer_snapshots` | Version history on material changes |
| `quarantine_records` | Rejected/low-confidence offers |
| `sources` | Source registry with status and metrics |
| `source_runs` | Per-source validation runs |
| `source_observations` | Metric observations |
| `source_failures` | Ingestion failure log per source |

Migrations auto-apply on backend startup (`db/migrate.js`).

---

## 12. Key Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://kanzpay:kanzpay@localhost:5435/kanzpay` | Postgres |
| `CRAWL_DATA_DIR` | `../storage/datasets/default` | Crawler output path |
| `DISCOVERY_DATA_PATH` | `../storage/.../DISCOVERY_RESULTS.json` | SERP metadata |
| `RUN_SUMMARY_PATH` | `../storage/.../RUN_SUMMARY.json` | Crawler quality metrics |
| `APIFY_TOKEN` | — | Pull artifacts from Apify cloud |
| `APIFY_WEBHOOK_SECRET` | — | Webhook authentication |
| `CONFIDENCE_FLOOR` | `0.4` | Canonical vs quarantine threshold |
| `STALE_AFTER_DAYS` | `14` | Default stale window |
| `PORT` | `5436` | API server port |
| `OPENAI_API_KEY` | — | **Required** — OpenAI API key for payment Layer 3 |
| `OPENAI_MODEL` | `gpt-4o` | Model used by `ai-recommendation.service.js` |

---

## 13. Operational Commands Reference

### Repo root (crawler)

```bash
npm install && npx playwright install chromium
npm test                          # parser + discovery unit tests
npm start                         # local crawl from INPUT.json
node src/jobs/crawl-approved-sources.job.js  # build INPUT from registry
```

### Backend

```bash
cd backend && cp .env.example .env
docker compose up -d && npm run migrate
npm run ingest                    # ingest crawl JSON
npm run pipeline:ingest           # ingest + refresh + validate
npm start                         # API server
npm run refresh                   # mark stale offers
npm run crawl-plan                # generate crawl targets
npm run review-discovery          # build discovery candidates
npm test                          # unit tests
```

### Full local pipeline

```bash
./scripts/run-local-pipeline.sh
```

---

## 14. Data Flow Summary Diagram

```mermaid
sequenceDiagram
    participant Reg as Source Registry
    participant Crawl as Crawler (Apify)
    participant DS as Dataset JSON
    participant Ing as Ingestion Job
    participant DB as PostgreSQL
    participant API as REST API
    participant Rules as Rules Engine
    participant OAI as OpenAI GPT-4o

    Reg->>Crawl: crawl plan / INPUT.json
    Crawl->>DS: offer rows + RUN_SUMMARY
    DS->>Ing: read *.json files
    Ing->>DB: raw_crawl_events (all valid)
    Ing->>DB: offers OR quarantine_records
    Ing->>DB: ingestion_runs stats
    Ing->>Reg: update source health metrics

    API->>DB: query offers / quarantine / sources
    API->>Rules: Layer 2 — payment combinations
    Rules->>OAI: Layer 3 — mandatory AI recommendation
    OAI-->>API: final recommendation
```

---

## 15. Design Principles

1. **Separation of concerns** — Crawler extracts; backend validates, scores, and governs.
2. **No silent data loss** — Quarantine captures everything that doesn't make canonical.
3. **Source governance** — Approved/probation/rejected lifecycle controls crawl and ingest strictness.
4. **Progressive enhancement** — Cheerio → Playwright retry; discovery as optional seed layer.
5. **Auditability** — Raw events, snapshots, ingestion runs, and source failure logs.
6. **Probation-aware quality** — Visa and FAB use stricter gates aligned between crawler and backend.
7. **Layered payment pipeline** — Operational rules engine for math; mandatory OpenAI layer for final recommendation — separate from crawl/ingest operations.

---

## 16. Consumer Wallet & Checkout API (Paytm-style)

Backend-first payment-time recommendation for the KanzPay consumer app model.

### Auth & wallet

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /auth/register` | No | Create user (email + password) |
| `POST /auth/login` | No | JWT token |
| `GET /wallet/instruments` | Bearer | Full wallet payload |
| `POST /wallet/cards` | Bearer | Add card (optional `cardProductId` for reward rates) |
| `POST /wallet/coupons` | Bearer | Save coupon |
| `PUT /wallet/loyalty` | Bearer | Replace loyalty accounts |
| `PUT /wallet/membership` | Bearer | Set membership tier |
| `GET /cards/products` | No | Card reward rate catalog |

### Merchants & checkout

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /merchants` | No | Register shop + QR code |
| `POST /checkout/sessions` | Bearer | Start checkout `{ merchantId, amount }` |
| `GET /checkout/sessions/:id/recommend` | Bearer | Full Paytm-style breakdown + AI |
| `PATCH /checkout/sessions/:id/instruments` | Bearer | Toggle card/coupon/loyalty → re-recommend |

### Offer merge at checkout

1. Load user wallet instruments from DB
2. Fetch crawled offers (`offers` table) by merchant + aliases
3. Merge crawled `coupon_code` offers into coupon instruments (wallet wins on duplicate codes)
4. Run rules engine + AI via existing `payment/recommend` pipeline

Low-confidence crawled offers include `verifyRequired: true` and a response-level disclaimer.

### Weekly discovery pipeline

```bash
./scripts/run-weekly-discovery-pipeline.sh
# or: npm run discovery:plan (backend) then crawl with INPUT.discovery.json
```

Flow: discovery SERP → crawl → ingest → `DISCOVERY_CANDIDATES.json` for human review.

### Crawl configuration (production INPUT)

Generated by `node src/jobs/crawl-approved-sources.job.js`:

- Full source registry (~25 sources)
- `maxDepth: 2`, `maxRequestsPerCrawl: 300`
- Playwright for JS-heavy coupon/loyalty sites

### Environment

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Auth token signing |
| `JWT_EXPIRES_IN` | Token TTL (default `7d`) |
| `OPENAI_API_KEY` | Checkout AI layer |
