-- Migration 008: Users and wallet instruments

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(256) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    phone VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_name VARCHAR(128) NOT NULL,
    balance_coins NUMERIC(12,2) NOT NULL DEFAULT 0,
    conversion_rate NUMERIC(10,4) NOT NULL DEFAULT 100,
    earn_rate_per_aed NUMERIC(10,4) NOT NULL DEFAULT 0,
    max_redeemable_coins NUMERIC(12,2),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    program_name VARCHAR(256),
    discount_type VARCHAR(32) NOT NULL DEFAULT 'percent',
    discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_spend NUMERIC(10,2),
    max_discount NUMERIC(10,2),
    expires_at DATE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    source VARCHAR(32) NOT NULL DEFAULT 'wallet',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, code)
);

CREATE TABLE IF NOT EXISTS user_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
    program_name VARCHAR(128) NOT NULL DEFAULT 'Privilege Club',
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_name VARCHAR(128) NOT NULL,
    card_network VARCHAR(32) NOT NULL,
    card_type VARCHAR(16) NOT NULL DEFAULT 'credit',
    last_four VARCHAR(4),
    card_product_id UUID REFERENCES card_products(id) ON DELETE SET NULL,
    reward_rate_per_aed NUMERIC(8,4),
    gold_mg_per_aed NUMERIC(8,4),
    reward_unit VARCHAR(32) DEFAULT 'points',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_name VARCHAR(128) NOT NULL,
    account_no VARCHAR(64),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_loyalty_user ON user_loyalty_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_user ON user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_banks_user ON user_banks(user_id);

COMMIT;
