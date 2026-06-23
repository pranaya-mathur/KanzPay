# KanzPay Public Offers Scraper

Production-grade Apify Actor for **scheduled** ingestion of UAE public bank, Visa, merchant, coupon, and Google-discovered offer pages.

## Architecture

```
INPUT
  │
  ├─ Phase 0: discoveryCrawler (optional, discoveryEnabled)
  │     └─ serpDiscovery.js → Google SERP → filtered crawl seeds
  │
  ├─ Phase 1: CheerioCrawler (auto) or Playwright
  │     └─ genericCrawler → parsers → offerSchema → dataset
  │
  └─ Phase 2: Playwright retry (auto mode, JS shells)
```

```
.actor/          Apify config
src/
  main.js
  schema/offerSchema.js       # createDefaultOffer, passesQualityGate, normalizeOffer
  crawlers/
    crawlerFactory.js
    genericCrawler.js
    discoveryCrawler.js       # Google SERP seeding
  parsers/                    # ENBD, Visa, FAB, coupon, merchant, generic
  utils/
    serpDiscovery.js          # SERP parse, filter, relevance
    normalize.js, extractPatterns.js, confidence.js, dedupe.js, linkFilter.js, pdfExtract.js
scripts/
  test-parsers.js
  test-discovery.js
```

## Local Run

```bash
npm install
npx playwright install chromium
npm test                    # offline parser + discovery unit tests
npm start                   # reads storage/key_value_stores/default/INPUT.json
```

Output: `storage/datasets/default/*.json`  
Discovery log: `storage/key_value_stores/default/DISCOVERY_RESULTS.json`

## Example Input (with discovery)

```json
{
  "startUrls": [
    { "url": "https://www.emiratesnbd.com/en/deals", "userData": { "sourceType": "emiratesNbd" } }
  ],
  "discoveryEnabled": true,
  "discoveryQueries": [
    "Emirates NBD deals UAE",
    "Visa UAE offers",
    "FAB credit card offers UAE"
  ],
  "discoveryMaxResults": 10,
  "discoveryCountry": "ae",
  "discoveryLanguage": "en",
  "crawlerMode": "auto",
  "maxDepth": 1,
  "maxRequestsPerCrawl": 50,
  "allowedDomains": ["emiratesnbd.com", "visa.co.ae", "bankfab.com", "noon.com"],
  "includeText": false,
  "saveSnapshots": true
}
```

**Note:** Discovery is for scheduled crawls only. Use `debugUrl` to skip discovery for single-page tests.

## Deploy

```bash
apify push
```
