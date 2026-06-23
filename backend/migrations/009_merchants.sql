-- Migration 009: Merchants, aliases, and checkout sessions

BEGIN;

CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(256) NOT NULL,
    category VARCHAR(128),
    mcc VARCHAR(8),
    qr_code VARCHAR(64) UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    alias VARCHAR(256) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (alias)
);

CREATE INDEX IF NOT EXISTS idx_merchants_name ON merchants(name);
CREATE INDEX IF NOT EXISTS idx_merchant_aliases_alias ON merchant_aliases(alias);

CREATE TABLE IF NOT EXISTS checkout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    requested_amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'AED',
    selected_card_id UUID REFERENCES user_cards(id) ON DELETE SET NULL,
    selected_coupon_id UUID REFERENCES user_coupons(id) ON DELETE SET NULL,
    loyalty_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    membership_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user ON checkout_sessions(user_id);

COMMIT;
