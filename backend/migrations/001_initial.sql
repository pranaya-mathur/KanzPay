-- KanzPay backend initial schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type VARCHAR(64) NOT NULL DEFAULT 'crawl_ingest',
    input_json JSONB NOT NULL DEFAULT '{}',
    stats_json JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS raw_crawl_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    discovery_query TEXT,
    discovery_source TEXT,
    serp_rank INTEGER,
    source_type VARCHAR(64) NOT NULL,
    parser_name VARCHAR(128),
    parser_reason TEXT,
    raw_html TEXT,
    raw_text TEXT,
    scraped_at TIMESTAMPTZ,
    page_length INTEGER DEFAULT 0,
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_key VARCHAR(128) NOT NULL UNIQUE,
    source_url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    source_type VARCHAR(64) NOT NULL,
    bank_name VARCHAR(128),
    card_name VARCHAR(128),
    merchant_name VARCHAR(256),
    offer_title TEXT,
    offer_description TEXT,
    discount_type VARCHAR(32),
    discount_value TEXT,
    currency VARCHAR(8) DEFAULT 'AED',
    min_spend NUMERIC,
    cap_value NUMERIC,
    valid_from DATE,
    valid_to DATE,
    coupon_code VARCHAR(64),
    payment_methods JSONB NOT NULL DEFAULT '[]',
    eligible_mcc_list JSONB NOT NULL DEFAULT '[]',
    categories JSONB NOT NULL DEFAULT '[]',
    stackable BOOLEAN NOT NULL DEFAULT FALSE,
    terms_url TEXT,
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
    freshness_status VARCHAR(32) NOT NULL DEFAULT 'fresh',
    discovery_query TEXT,
    discovery_source TEXT,
    serp_rank INTEGER,
    parser_name VARCHAR(128),
    crawl_depth INTEGER DEFAULT 0,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offer_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    canonical_key VARCHAR(128) NOT NULL,
    source_url TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_crawl_events_run_id ON raw_crawl_events(run_id);
CREATE INDEX IF NOT EXISTS idx_raw_crawl_events_source_url ON raw_crawl_events(source_url);
CREATE INDEX IF NOT EXISTS idx_raw_crawl_events_source_type ON raw_crawl_events(source_type);

CREATE INDEX IF NOT EXISTS idx_offers_normalized_url ON offers(normalized_url);
CREATE INDEX IF NOT EXISTS idx_offers_canonical_key ON offers(canonical_key);
CREATE INDEX IF NOT EXISTS idx_offers_merchant_name ON offers(merchant_name);
CREATE INDEX IF NOT EXISTS idx_offers_bank_name ON offers(bank_name);
CREATE INDEX IF NOT EXISTS idx_offers_card_name ON offers(card_name);
CREATE INDEX IF NOT EXISTS idx_offers_coupon_code ON offers(coupon_code);
CREATE INDEX IF NOT EXISTS idx_offers_source_type ON offers(source_type);
CREATE INDEX IF NOT EXISTS idx_offers_last_seen_at ON offers(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_offers_freshness_status ON offers(freshness_status);
CREATE INDEX IF NOT EXISTS idx_offers_confidence ON offers(confidence);
CREATE INDEX IF NOT EXISTS idx_offers_discovery_query ON offers(discovery_query);

CREATE INDEX IF NOT EXISTS idx_offer_snapshots_offer_id ON offer_snapshots(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_snapshots_hash ON offer_snapshots(hash);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status ON ingestion_runs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_at ON ingestion_runs(started_at DESC);
