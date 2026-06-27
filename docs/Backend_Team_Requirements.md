# KanzPay — Backend Team Requirements
**From:** KanzPay Recommendation Engine (your codebase)  
**To:** Cross-Functional Backend Team (production Supabase)  
**Date:** 2026-06-27

---

## Context

The KanzPay recommendation engine is built and working. It handles:
- AI-powered savings calculation (200 AED → 130 AED)
- Loyalty points, discount coupons, membership stacking
- Bank / card instrument selection
- Checkout session management

For this engine to work with **real users and real payments**, the backend team needs to do the following.

---

## Requirement 1 — Run This SQL on Production (Users DB)

**File:** `docs/production-migration-for-backend-team.sql`  
**Where:** Supabase project `ariegorjlfenlzelwjsb` → SQL Editor  
**Time:** 5 minutes

This adds the following columns to `payment_requests`:

| New Column | Type | Purpose |
|---|---|---|
| `gross_amount_aed` | NUMERIC | Original seller amount before discounts |
| `net_amount_aed` | NUMERIC | Final amount buyer actually pays |
| `loyalty_redeemed_aed` | NUMERIC | How much loyalty points saved |
| `coupon_discount_aed` | NUMERIC | How much coupon saved |
| `membership_discount_aed` | NUMERIC | How much membership (FAZAA etc.) saved |
| `discount_breakdown` | JSONB | Full breakdown array |
| `checkout_session_id` | UUID | Links back to our recommendation session |

It also creates the missing `split_payment_groups` table.

---

## Requirement 2 — Share One Connection String

**What:** Supabase Users DB connection string  
**Where to find:** Supabase Dashboard → Project `ariegorjlfenlzelwjsb` → Settings → Database → Connection string (URI format)

```
postgresql://postgres:[YOUR-PASSWORD]@db.ariegorjlfenlzelwjsb.supabase.co:5432/postgres
```

Share this with us — we add it to our `.env` as `SUPABASE_USERS_DB_URL` and the integration goes live immediately.

---

## Requirement 3 — Add These 3 Tables to Production (Users DB)

These tables do not exist in production yet. Our engine needs them to read loyalty balances, coupons, and membership discounts for real users.

### Table A — `user_loyalty_accounts`
```sql
CREATE TABLE user_loyalty_accounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_name         VARCHAR(128) NOT NULL,       -- "LUNNA", "Air India Rewards"
    balance_coins        NUMERIC(12,2) NOT NULL DEFAULT 0,
    conversion_rate      NUMERIC(10,4) NOT NULL DEFAULT 100, -- 100 coins = 1 AED
    earn_rate_per_aed    NUMERIC(10,4) NOT NULL DEFAULT 0,
    max_redeemable_coins NUMERIC(12,2),
    enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON user_loyalty_accounts(user_id);
```

### Table B — `user_coupons`
```sql
CREATE TABLE user_coupons (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code           VARCHAR(64) NOT NULL,
    program_name   VARCHAR(256),                      -- "Amazon Sale Coupon"
    discount_type  VARCHAR(32) NOT NULL DEFAULT 'percent', -- "percent" or "fixed"
    discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_spend      NUMERIC(10,2),
    max_discount   NUMERIC(10,2),
    expires_at     DATE,
    enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, code)
);
CREATE INDEX ON user_coupons(user_id);
```

### Table C — `user_memberships`
```sql
CREATE TABLE user_memberships (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tier             VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
    program_name     VARCHAR(128) NOT NULL DEFAULT 'Privilege Club', -- "FAZAA", "Premium Club"
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Requirement 4 — `user_payment_methods` Field Confirmation

Our engine reads from your existing `user_payment_methods` table. We expect `provider_data` JSONB to contain the following fields — please confirm they are consistently populated:

**For type = `bank` (Lean A2A):**
```json
{
  "bankName": "Emirates NBD",
  "customerId": "lean-customer-uuid",
  "destinationId": "lean-destination-uuid",
  "accountType": "BUSINESS"
}
```

**For type = `card` (N-Genius):**
```json
{
  "bankName": "ADCB",
  "cardBrand": "Visa",
  "cardType": "credit",
  "last4": "4242",
  "ngeniusCardToken": "token-string",
  "expiryMonth": 12,
  "expiryYear": 2027
}
```

If field names are different (e.g. `bank_name` instead of `bankName`), let us know — we update our mapper in 5 minutes.

---

## Requirement 5 — `payment_requests` Insert Permission

When a buyer presses **Pay Now**, our engine creates a `payment_request` in your production DB with the net amount. We need INSERT permission on `payment_requests` via the connection string shared in Requirement 2.

The record we insert looks like this:
```json
{
  "seller_user_id": "uuid-of-seller",
  "buyer_user_id": "uuid-of-buyer",
  "amount_aed": 129.6,
  "net_amount_aed": 129.6,
  "gross_amount_aed": 200.0,
  "payment_option": "bank",
  "status": "PENDING",
  "loyalty_redeemed_aed": 40.0,
  "coupon_discount_aed": 16.0,
  "membership_discount_aed": 14.4,
  "discount_breakdown": [...],
  "checkout_session_id": "our-session-uuid"
}
```

After this, your existing Lean/N-Genius gateway flow takes over normally.

---

## Summary — What Each Requirement Unlocks

| # | What Backend Team Does | What Goes Live |
|---|---|---|
| 1 | Run SQL migration | Discount data stored per payment |
| 2 | Share DB connection string | Real bank/card accounts shown at checkout |
| 3 | Create 3 tables | Real loyalty, coupons, membership at checkout |
| 4 | Confirm `provider_data` field names | Correct bank/card names shown to buyer |
| 5 | Confirm INSERT permission | Pay Now button creates production payment |

**Requirements 1 + 2 alone → PDF checkout flow goes live for bank/card payments.**  
**Requirements 3, 4, 5 → Full 200 → 130 savings flow goes live for real users.**

---

## Questions / Contact

Any clarifications on the above — ping us directly. We can integrate within same day once these are provided.
