#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== KanzPay local pipeline =="

echo "[1/4] Build registry crawl INPUT"
node "$ROOT/src/jobs/crawl-approved-sources.job.js"

echo "[2/4] Run crawler (requires Apify local or npm start)"
if command -v apify >/dev/null 2>&1; then
  apify run --input-file "$ROOT/storage/key_value_stores/default/INPUT.json"
else
  npm --prefix "$ROOT" start
fi

echo "[3/4] Ingest + refresh + validate"
npm --prefix "$ROOT/backend" run pipeline:ingest

echo "[4/4] Optional discovery candidates"
npm --prefix "$ROOT/backend" run review-discovery || true

echo "Done."
