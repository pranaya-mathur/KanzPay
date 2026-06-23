-- Source registry and health tracking

CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name VARCHAR(256) NOT NULL,
    domain VARCHAR(256) NOT NULL,
    base_url TEXT NOT NULL,
    source_type VARCHAR(64) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'bank',
    status VARCHAR(32) NOT NULL DEFAULT 'probation',
    priority INTEGER NOT NULL DEFAULT 50,
    approval_reason TEXT,
    rejection_reason TEXT,
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
    avg_offer_confidence NUMERIC(4,3),
    avg_field_completeness NUMERIC(4,3),
    avg_parse_success_rate NUMERIC(4,3),
    avg_merchant_yield NUMERIC(4,3),
    avg_freshness_score NUMERIC(4,3),
    last_crawled_at TIMESTAMPTZ,
    last_passed_at TIMESTAMPTZ,
    last_failed_at TIMESTAMPTZ,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    quarantine_count INTEGER NOT NULL DEFAULT 0,
    sample_size INTEGER NOT NULL DEFAULT 0,
    parser_profile_json JSONB NOT NULL DEFAULT '{}',
    crawl_rules_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (domain, source_type)
);

CREATE TABLE IF NOT EXISTS source_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    run_type VARCHAR(64) NOT NULL DEFAULT 'validation',
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    stats_json JSONB NOT NULL DEFAULT '{}',
    score NUMERIC(4,3),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS source_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    source_run_id UUID REFERENCES source_runs(id) ON DELETE SET NULL,
    observation_type VARCHAR(64) NOT NULL,
    metric_name VARCHAR(64),
    metric_value NUMERIC,
    details_json JSONB NOT NULL DEFAULT '{}',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    source_run_id UUID REFERENCES source_runs(id) ON DELETE SET NULL,
    failure_type VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    sample_url TEXT,
    details_json JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE offers ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id) ON DELETE SET NULL;
ALTER TABLE raw_crawl_events ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id) ON DELETE SET NULL;
ALTER TABLE quarantine_records ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sources_domain ON sources(domain);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_sources_confidence ON sources(confidence);
CREATE INDEX IF NOT EXISTS idx_sources_last_crawled_at ON sources(last_crawled_at);
CREATE INDEX IF NOT EXISTS idx_sources_source_type ON sources(source_type);
CREATE INDEX IF NOT EXISTS idx_sources_category ON sources(category);
CREATE INDEX IF NOT EXISTS idx_source_runs_source_id ON source_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_source_observations_source_id ON source_observations(source_id);
CREATE INDEX IF NOT EXISTS idx_source_failures_source_id ON source_failures(source_id);
CREATE INDEX IF NOT EXISTS idx_offers_source_id ON offers(source_id);

-- Seed known UAE offer sources
INSERT INTO sources (
    source_name, domain, base_url, source_type, category, status, priority,
    confidence, approval_reason, parser_profile_json, crawl_rules_json
) VALUES
(
    'Emirates NBD Deals',
    'emiratesnbd.com',
    'https://www.emiratesnbd.com/en/deals',
    'emiratesNbd',
    'bank',
    'approved',
    100,
    0.92,
    'Strong structured merchant-level deals with expiry and discount fields',
    '{"parserName":"emiratesNbdParser","crawlerMode":"playwright","maxDepth":1,"confidenceFloor":0.4,"enqueueSelector":"a[href*=\"/deals/\"]"}',
    '{"allowedPaths":["/deals/"],"excludePaths":["/campaigns/","/deal-search"],"autoCrawl":true}'
),
(
    'Visa UAE Offers & Perks',
    'visamiddleeast.com',
    'https://ae.visamiddleeast.com/en_ae/visa-offers-and-perks/',
    'visaUAE',
    'network',
    'probation',
    80,
    0.72,
    'Usable Angular listing; detail pages need parser tuning',
    '{"parserName":"visaUAEParser","crawlerMode":"playwright","maxDepth":1,"confidenceFloor":0.45,"waitSelector":".vs-card"}',
    '{"allowedPaths":["/visa-offers-and-perks/"],"autoCrawl":true,"strictQualityGate":true}'
),
(
    'FAB Card Offers',
    'bankfab.com',
    'https://www.bankfab.com/en-ae/personal/cards/credit-cards/offers',
    'fab',
    'bank',
    'probation',
    60,
    0.55,
    'Mixed category headers and merchant offers; needs stricter gates',
    '{"parserName":"fabParser","crawlerMode":"playwright","maxDepth":1,"confidenceFloor":0.5}',
    '{"allowedPaths":["/offers"],"autoCrawl":true,"strictQualityGate":true,"categoryHeaderPenalty":true}'
),
(
    'Google SERP Discovery',
    'google.com',
    'https://www.google.com/search',
    'discovery',
    'discovery',
    'rejected',
    10,
    0.2,
    NULL,
    '{"discoveryOnly":true}',
    '{"autoCrawl":false,"scheduledOnly":true,"note":"Blocked locally; enable on Apify scheduled runs"}'
)
ON CONFLICT (domain, source_type) DO NOTHING;
