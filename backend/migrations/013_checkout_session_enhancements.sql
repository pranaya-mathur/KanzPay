-- Migration 013: Checkout session enhancements for PDF flow
-- Adds: session_type (online/in-store), points_redemption_pct (slider), production_user_id link

BEGIN;

ALTER TABLE checkout_sessions
    ADD COLUMN IF NOT EXISTS session_type VARCHAR(16) NOT NULL DEFAULT 'online'
        CHECK (session_type IN ('online', 'in_store')),
    ADD COLUMN IF NOT EXISTS pos_id TEXT,
    ADD COLUMN IF NOT EXISTS store_id TEXT,
    ADD COLUMN IF NOT EXISTS points_redemption_pct NUMERIC(5,2) NOT NULL DEFAULT 100
        CHECK (points_redemption_pct >= 0 AND points_redemption_pct <= 100),
    ADD COLUMN IF NOT EXISTS production_user_id UUID,
    ADD COLUMN IF NOT EXISTS production_payment_request_id UUID,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN checkout_sessions.session_type IS 'online = e-commerce, in_store = POS/QR scan';
COMMENT ON COLUMN checkout_sessions.points_redemption_pct IS 'PDF slider: % of loyalty points to redeem (0-100)';
COMMENT ON COLUMN checkout_sessions.production_user_id IS 'Links to users.id in production Supabase Users DB';
COMMENT ON COLUMN checkout_sessions.production_payment_request_id IS 'Set on confirm — links to payment_requests.id in production';

COMMIT;
