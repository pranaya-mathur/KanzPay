-- Ingestion hardening: idempotent runs, quarantine lifecycle, extended metadata

ALTER TABLE ingestion_runs
    ADD COLUMN IF NOT EXISTS apify_run_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS crawl_run_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_runs_apify_run_id
    ON ingestion_runs(apify_run_id) WHERE apify_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ingestion_run_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'processed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_ingestion_run_files_hash ON ingestion_run_files(content_hash);

ALTER TABLE quarantine_records
    ADD COLUMN IF NOT EXISTS quarantine_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_quarantine_quarantine_type ON quarantine_records(quarantine_type);
CREATE INDEX IF NOT EXISTS idx_quarantine_review_status ON quarantine_records(review_status);
