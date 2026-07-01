-- ============================================================
-- PRODUCTION MIGRATION — For Backend Team
-- Run on: Supabase Users DB (ariegorjlfenlzelwjsb)
-- Purpose: Add discount/reward columns to payment_requests
--          so KanzPay recommendation engine output is stored
--
-- UPDATED 2026-06-30: Fixed column names to match actual
-- production schema confirmed in db_full_extract.json
-- ============================================================

BEGIN;

-- Step 1: Add recommendation engine output columns to payment_requests
-- NOTE: Production uses 'amount' (not 'amount_aed'), 'payer_user_id' (not 'buyer_user_id'),
--       'merchant_user_id' (not 'seller_user_id'). These existing columns are untouched.
ALTER TABLE payment_requests
    ADD COLUMN IF NOT EXISTS gross_amount_aed         NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS net_amount_aed            NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS loyalty_redeemed_aed      NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS coupon_discount_aed       NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS membership_discount_aed   NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_breakdown        JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS checkout_session_id       UUID;

-- Idempotency guard: one payment_request per checkout session.
-- The KanzPay service uses error code 23505 to detect and recover from
-- duplicate inserts on network retry without creating double charges.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_checkout_session
    ON payment_requests (checkout_session_id)
    WHERE checkout_session_id IS NOT NULL;

-- Backfill: for existing rows, gross = net = amount (no discounts applied before)
-- Using 'amount' — the correct column name in production (not 'amount_aed')
UPDATE payment_requests
SET gross_amount_aed = amount,
    net_amount_aed   = amount
WHERE gross_amount_aed IS NULL;

-- NOTE: split_payment_groups already exists in production with its own schema.
-- Do NOT run CREATE TABLE for it. The KanzPay recommendation engine does not
-- write to split_payment_groups — it only reads/writes payment_requests.

COMMIT;

-- ============================================================
-- NOTES FOR BACKEND TEAM
-- ============================================================
-- What this migration does:
--   Adds 7 new columns to payment_requests. All are nullable / have defaults
--   so existing app flows are unaffected.
--
-- New column meanings:
--   gross_amount_aed   = Original seller price before any discounts (AED)
--   net_amount_aed     = Final amount the buyer actually pays after discounts (AED)
--                        Will equal 'amount' in most cases (that column is what
--                        gets sent to the payment gateway)
--   loyalty_redeemed_aed  = Discount from loyalty coins redemption
--   coupon_discount_aed   = Discount from applied coupon code
--   membership_discount_aed = Discount from membership tier (FAZAA, etc.)
--   discount_breakdown = Full JSON audit trail, shape:
--       [
--         { "type": "loyalty",    "label": "LUNNA (4000 coins)", "discountAed": 40 },
--         { "type": "coupon",     "label": "Amazon Sale (10%)",  "discountAed": 16 },
--         { "type": "membership", "label": "FAZAA GOLD (10%)",   "discountAed": 14.4 }
--       ]
--   checkout_session_id = UUID linking back to the KanzPay recommendation engine
--                         session (stored in local KanzPay backend DB, not Supabase).
--                         UNIQUE (partial index, NULLs excluded) — prevents double charges
--                         on network retry; the KanzPay service handles error code 23505.
--
-- What the KanzPay backend will INSERT when a buyer confirms payment:
--   merchant_user_id        = seller's user_id
--   payer_user_id           = buyer's user_id
--   amount                  = net_amount_aed (what gateway will charge)
--   status                  = 'PAYMENT_INITIATED'
--   gross_amount_aed        = original price
--   net_amount_aed          = amount after discounts
--   loyalty_redeemed_aed    = loyalty discount applied
--   coupon_discount_aed     = coupon discount applied
--   membership_discount_aed = membership discount applied
--   discount_breakdown      = full JSON breakdown (for receipt / audit)
--   checkout_session_id     = recommendation session ID
--
-- No changes needed to split_payment_groups, payment_sessions, users, or
-- user_payment_methods — those tables are read-only from the recommendation engine.
-- ============================================================
