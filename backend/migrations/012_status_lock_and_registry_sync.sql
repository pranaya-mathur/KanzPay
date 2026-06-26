-- Migration 012: Lock Tier A source statuses and re-sync tier assignments

BEGIN;

ALTER TABLE sources ADD COLUMN IF NOT EXISTS status_locked BOOLEAN NOT NULL DEFAULT false;

-- Re-apply tier assignments (idempotent)
UPDATE sources SET status = 'approved', priority = 100, parser_profile_json = '{"parserName":"enbdParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":40,"confidenceFloor":0.55,"strictQualityGate":true}'
WHERE source_type = 'emiratesNbd';

UPDATE sources SET status = 'approved', priority = 98, parser_profile_json = '{"parserName":"adcbParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":60,"confidenceFloor":0.55,"strictQualityGate":true}'
WHERE source_type = 'adcb';

UPDATE sources SET status = 'approved', priority = 96, parser_profile_json = '{"parserName":"mashreqParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":50,"confidenceFloor":0.55,"strictQualityGate":true}'
WHERE source_type = 'mashreq';

UPDATE sources SET status = 'approved', priority = 94, parser_profile_json = '{"parserName":"fabParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":50,"confidenceFloor":0.55,"strictQualityGate":true}'
WHERE source_type = 'fab';

UPDATE sources SET status = 'approved', priority = 92, parser_profile_json = '{"parserName":"dibParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":30,"confidenceFloor":0.55,"strictQualityGate":true}'
WHERE source_type = 'dib';

UPDATE sources SET status = 'approved', priority = 90, parser_profile_json = '{"parserName":"adibParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":25,"confidenceFloor":0.55,"strictQualityGate":true}'
WHERE source_type = 'adib';

UPDATE sources SET status = 'probation', priority = 75, parser_profile_json = '{"parserName":"rakbankParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":25,"confidenceFloor":0.45,"strictQualityGate":true}'
WHERE source_type = 'rakBank';

UPDATE sources SET status = 'probation', priority = 70, parser_profile_json = '{"parserName":"hsbcParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":20,"confidenceFloor":0.45,"strictQualityGate":true}'
WHERE source_type = 'hsbc';

UPDATE sources SET status = 'probation', priority = 65, parser_profile_json = '{"parserName":"cbdParser","crawlerMode":"playwright","maxDepth":2,"maxRequestsBudget":15,"confidenceFloor":0.45,"strictQualityGate":true}'
WHERE source_type = 'cbd';

UPDATE sources SET status = 'probation', priority = 68, parser_profile_json = '{"parserName":"visaParser","crawlerMode":"playwright","maxDepth":1,"maxRequestsBudget":30,"confidenceFloor":0.45,"strictQualityGate":true}'
WHERE source_type = 'visaUAE';

UPDATE sources SET status = 'rejected', priority = 40, parser_profile_json = '{"parserName":"bankOfferParser","autoCrawl":false}'
WHERE source_type IN ('citibank', 'scb', 'groupon');

-- Lock Tier A banks from health-refresh demotion
UPDATE sources SET status_locked = true
WHERE source_type IN ('emiratesNbd', 'adcb', 'mashreq', 'fab', 'dib', 'adib');

UPDATE sources SET status_locked = false
WHERE source_type NOT IN ('emiratesNbd', 'adcb', 'mashreq', 'fab', 'dib', 'adib');

-- Purge weak HSBC slug garbage
DELETE FROM offers WHERE source_type = 'hsbc' AND (
    merchant_name IS NULL OR discount_value IS NULL
    OR COALESCE(NULLIF(regexp_replace(discount_value, '[^0-9.]', '', 'g'), '')::numeric, 0) <= 1
);

-- Purge known noise offers
DELETE FROM offers WHERE source_type = 'fab' AND (
    offer_title ILIKE '%shard%' OR offer_title ILIKE '%sea life%'
    OR merchant_name ILIKE '%food & drink offers%'
    OR merchant_name ILIKE '%seasonal offers%'
);

DELETE FROM offers WHERE source_type = 'adcb' AND (
    merchant_name ILIKE '%logo facebook%'
    OR offer_title ILIKE '%refer a friend%'
    OR offer_title ILIKE '%touchpoints max%'
);

COMMIT;
