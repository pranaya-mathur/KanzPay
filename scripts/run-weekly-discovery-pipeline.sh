#!/usr/bin/env bash
# Weekly discovery crawl + ingest + candidate review
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== KanzPay weekly discovery pipeline =="

echo "[1/4] Build discovery INPUT"
node "$ROOT/src/jobs/crawl-discovery-sources.job.js"

echo "[2/4] Run discovery crawl"
if command -v apify >/dev/null 2>&1; then
  apify run --input-file "$ROOT/storage/key_value_stores/default/INPUT.discovery.json"
else
  cp "$ROOT/storage/key_value_stores/default/INPUT.discovery.json" "$ROOT/storage/key_value_stores/default/INPUT.json"
  npm --prefix "$ROOT" start
fi

echo "[3/4] Ingest + refresh"
npm --prefix "$ROOT/backend" run pipeline:ingest

echo "[4/4] Build discovery candidates for review"
npm --prefix "$ROOT/backend" run review-discovery

echo "Done. Review storage/key_value_stores/default/DISCOVERY_CANDIDATES.json"
