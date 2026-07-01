-- Migration 015: Store merchant's production user ID on checkout session
-- Moves seller identity from confirm-time client body to session-creation time,
-- so confirmSession reads it from the session instead of trusting req.body.

BEGIN;

ALTER TABLE checkout_sessions
    ADD COLUMN IF NOT EXISTS production_merchant_user_id UUID;

COMMENT ON COLUMN checkout_sessions.production_merchant_user_id
    IS 'Seller production user ID (users.id in Supabase). Set at session creation, not at confirm.';

COMMIT;
