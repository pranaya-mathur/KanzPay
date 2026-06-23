-- Quarantine store for rejected and low-confidence offers (separate from canonical offers)

CREATE TABLE IF NOT EXISTS quarantine_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
    source_url TEXT,
    canonical_key VARCHAR(128),
    raw_payload_json JSONB NOT NULL DEFAULT '{}',
    normalized_payload_json JSONB,
    rejection_reasons_json JSONB NOT NULL DEFAULT '[]',
    confidence NUMERIC(4,3),
    source_type VARCHAR(64),
    discovery_query TEXT,
    discovery_source TEXT,
    serp_rank INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quarantine_run_id ON quarantine_records(run_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_source_url ON quarantine_records(source_url);
CREATE INDEX IF NOT EXISTS idx_quarantine_canonical_key ON quarantine_records(canonical_key);
CREATE INDEX IF NOT EXISTS idx_quarantine_source_type ON quarantine_records(source_type);
CREATE INDEX IF NOT EXISTS idx_quarantine_confidence ON quarantine_records(confidence);
CREATE INDEX IF NOT EXISTS idx_quarantine_created_at ON quarantine_records(created_at DESC);
