-- ============================================================
-- PRODUCTION MIGRATION — For Backend Team
-- Run on: Supabase Users DB (ariegorjlfenlzelwjsb)
-- Purpose: Add discount/reward columns to payment_requests
--          so KanzPay recommendation engine output is stored
-- ============================================================

BEGIN;

-- Step 1: Add recommendation engine output columns to payment_requests
ALTER TABLE payment_requests
    ADD COLUMN IF NOT EXISTS gross_amount_aed         NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS net_amount_aed            NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS loyalty_redeemed_aed      NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS coupon_discount_aed       NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS membership_discount_aed   NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_breakdown        JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS checkout_session_id       UUID;

-- Backfill: existing rows — gross = net = amount_aed (no discounts applied before)
UPDATE payment_requests
SET gross_amount_aed = amount_aed,
    net_amount_aed   = amount_aed
WHERE gross_amount_aed IS NULL;

-- Step 2: split_payment_groups table (missing from production — confirmed in DB extract)
CREATE TABLE IF NOT EXISTS split_payment_groups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_request_id  UUID NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
    buyer_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    split_count         INT NOT NULL,
    amount_per_split    NUMERIC(12,2) NOT NULL,
    members             JSONB NOT NULL DEFAULT '[]',
    status              VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_groups_payment_request ON split_payment_groups(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_split_groups_buyer ON split_payment_groups(buyer_user_id);

COMMIT;

-- ============================================================
-- NOTES FOR BACKEND TEAM
-- ============================================================
-- 1. amount_aed column still exists and is the NET amount buyer pays
--    gross_amount_aed = original seller price before discounts
--    net_amount_aed   = same as amount_aed (redundant, for clarity)
--
-- 2. discount_breakdown is a JSONB array, shape:
--    [
--      { "type": "loyalty",    "label": "LUNNA (4000 coins)", "discountAed": 40 },
--      { "type": "coupon",     "label": "Amazon Sale (10%)",  "discountAed": 16 },
--      { "type": "membership", "label": "FAZAA GOLD (10%)",   "discountAed": 14.4 }
--    ]
--
-- 3. checkout_session_id links back to KanzPay recommendation engine session
--    (stored in local KanzPay backend DB, not Supabase)
-- ============================================================
