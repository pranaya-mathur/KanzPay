-- Offer validity status, LLM enrichment metadata, and checkout verification flags

BEGIN;

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS validity_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS verify_required BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS llm_enriched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS llm_confidence NUMERIC(4,3),
    ADD COLUMN IF NOT EXISTS llm_enrichment_json JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_offers_validity_status ON offers(validity_status);
CREATE INDEX IF NOT EXISTS idx_offers_verify_required ON offers(verify_required) WHERE verify_required = true;
CREATE INDEX IF NOT EXISTS idx_offers_llm_enriched_at ON offers(llm_enriched_at);

-- Backfill validity_status from date fields
UPDATE offers SET validity_status = 'expired'
WHERE valid_to IS NOT NULL AND valid_to < CURRENT_DATE;

UPDATE offers SET validity_status = 'not_yet_active'
WHERE validity_status = 'unknown'
  AND valid_from IS NOT NULL AND valid_from > CURRENT_DATE;

UPDATE offers SET validity_status = 'active'
WHERE validity_status = 'unknown'
  AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
  AND (valid_from IS NULL OR valid_from <= CURRENT_DATE);

-- Offers with no end date need verification before checkout use
UPDATE offers SET verify_required = true
WHERE valid_to IS NULL AND validity_status IN ('active', 'unknown');

COMMIT;
