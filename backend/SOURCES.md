# Source Registry & Validation

The source registry controls which UAE offer sources are crawled, how strictly they are ingested, and when parser work is worth scaling.

## Status model

| Status | Crawl | Ingest | Typical use |
|--------|-------|--------|-------------|
| `approved` | Yes, normal gates | Yes | ENBD — stable merchant-level offers |
| `probation` | Yes, stricter gates | Yes | Visa, FAB — useful but noisy |
| `rejected` | No | Quarantined | Google discovery, broken shells |

## Workflow

```
1. Seed / register source (domain, baseUrl, parserProfile, crawlRules)
2. Crawl sample → ingest
3. POST /sources/validate  (or npm run validate-sources -- --all)
4. Compute metrics from offers + quarantine
5. Assign status: approved | probation | rejected
6. npm run crawl-plan  → writes INPUT.registry.json for crawler
7. Only approved + probation sources enter crawl planning
```

## Seeded sources

| Source | Status | Notes |
|--------|--------|-------|
| Emirates NBD Deals | `approved` | Priority 100 |
| Visa UAE Offers | `probation` | Stricter floor (0.45), `.vs-card` wait |
| FAB Card Offers | `probation` | Floor 0.5, category-header penalty |
| Google SERP Discovery | `rejected` | Scheduled Apify only |

## Jobs

```bash
npm run validate-sources
npm run refresh-sources
npm run refresh-sources -- --write-plan
npm run crawl-plan
```

See `backend/README.md` for full API list.
