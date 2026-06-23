-- Migration 007: Card products catalog (reward earn rates)

BEGIN;

CREATE TABLE IF NOT EXISTS card_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name VARCHAR(128) NOT NULL,
    card_network VARCHAR(32) NOT NULL,
    product_name VARCHAR(256) NOT NULL,
    reward_rate_per_aed NUMERIC(8,4) NOT NULL DEFAULT 0,
    gold_mg_per_aed NUMERIC(8,4) NOT NULL DEFAULT 0,
    reward_unit VARCHAR(32) NOT NULL DEFAULT 'points',
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bank_name, card_network, product_name)
);

CREATE INDEX IF NOT EXISTS idx_card_products_bank ON card_products(bank_name);
CREATE INDEX IF NOT EXISTS idx_card_products_network ON card_products(card_network);

INSERT INTO card_products (bank_name, card_network, product_name, reward_rate_per_aed, gold_mg_per_aed, reward_unit, source_url) VALUES
('ADCB', 'Visa', 'TouchPoints Titanium', 1.54, 0.01, 'points', 'https://www.adcb.com'),
('ADCB', 'Mastercard', 'TouchPoints Platinum', 1.54, 0.01, 'points', 'https://www.adcb.com'),
('First Abu Dhabi Bank', 'Visa', 'FAB Rewards', 0.77, 0, 'points', 'https://www.bankfab.com'),
('First Abu Dhabi Bank', 'Mastercard', 'FAB Cashback', 0.77, 0, 'points', 'https://www.bankfab.com'),
('Emirates NBD', 'Visa', 'Duo Card', 1.0, 0, 'points', 'https://www.emiratesnbd.com'),
('Emirates NBD', 'Mastercard', 'Skywards Infinite', 1.0, 0, 'miles', 'https://www.emiratesnbd.com'),
('Mashreq', 'Visa', 'Cashback Card', 1.0, 0, 'points', 'https://www.mashreq.com'),
('Mashreq', 'Mastercard', 'Platinum Plus', 1.0, 0, 'points', 'https://www.mashreq.com'),
('RAK Bank', 'Visa', 'Titanium Credit', 1.0, 0, 'points', 'https://www.rakbank.ae'),
('RAK Bank', 'Mastercard', 'World Credit', 1.0, 0, 'points', 'https://www.rakbank.ae'),
('HSBC', 'Visa', 'Cashback', 1.0, 0, 'points', 'https://www.hsbc.ae'),
('HSBC', 'Mastercard', 'Premier', 1.0, 0, 'points', 'https://www.hsbc.ae'),
('CBD', 'Visa', 'Super Saver', 1.0, 0, 'points', 'https://www.cbd.ae'),
('Citibank', 'Visa', 'Citi Rewards', 1.0, 0, 'points', 'https://www.citibank.ae'),
('Citibank', 'Mastercard', 'PremierMiles', 1.0, 0, 'miles', 'https://www.citibank.ae'),
('Dubai Islamic Bank', 'Visa', 'Consumer Rewards', 1.0, 0, 'points', 'https://www.dib.ae'),
('ADIB', 'Visa', 'Cashback Covered', 1.0, 0, 'points', 'https://www.adib.ae'),
('Standard Chartered', 'Visa', 'Manhattan Rewards+', 1.0, 0, 'points', 'https://www.sc.com/ae')
ON CONFLICT (bank_name, card_network, product_name) DO NOTHING;

COMMIT;
