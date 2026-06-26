-- Migration 010: Fix broken source URLs and demote coupon aggregators from default crawl
BEGIN;

UPDATE sources SET
    base_url = 'https://www.mashreq.com/en/uae/neo/offers/',
    updated_at = NOW()
WHERE source_type = 'mashreq';

UPDATE sources SET
    base_url = 'https://www.hsbc.ae/credit-cards/special-offers/',
    updated_at = NOW()
WHERE source_type = 'hsbc';

UPDATE sources SET
    base_url = 'https://www.adib.ae/en/offers',
    updated_at = NOW()
WHERE source_type = 'adib';

UPDATE sources SET
    status = 'rejected',
    parser_profile_json = parser_profile_json || '{"autoCrawl": false}'::jsonb,
    updated_at = NOW()
WHERE source_type IN ('groupon', 'mastercard');

UPDATE sources SET
    parser_profile_json = parser_profile_json || '{"autoCrawl": false, "maxDepth": 1}'::jsonb,
    updated_at = NOW()
WHERE source_type IN ('cuponation', 'picodi', 'couponsAe', 'wethrift', 'smiles', 'noon', 'shukran', 'bluerewards', 'talabat', 'namshi', 'amazonAe');

COMMIT;
