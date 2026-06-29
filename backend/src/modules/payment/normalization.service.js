/**
 * @file normalization.service.js
 * Payment-context normalization layer.
 *
 * Converts the raw checkout request (merchant info, basket amount, user
 * instruments) into a canonical PaymentContext that the rules engine and AI
 * recommendation layer can operate on deterministically.
 */

import { cleanText } from '../../shared/utils/text-normalize.js';

// ─── Canonical instrument types ───────────────────────────────────────────────

const LOYALTY_PROGRAM_ALIASES = {
    'abc loyalty rewards': 'abc_loyalty',
    'abc rewards': 'abc_loyalty',
    'smiles': 'smiles',
    'adib miles': 'adib_miles',
    'etihad guest': 'etihad_guest',
    'skywards': 'skywards',
    'enbd rewards': 'enbd_rewards',
};

const BANK_CARD_ALIASES = {
    'adcb': 'ADCB',
    'adcb bank': 'ADCB',
    'fab': 'First Abu Dhabi Bank',
    'first abu dhabi bank': 'First Abu Dhabi Bank',
    'emirates nbd': 'Emirates NBD',
    'enbd': 'Emirates NBD',
    'mashreq': 'Mashreq',
    'mashreq bank': 'Mashreq',
    'rak bank': 'RAK Bank',
    'rakbank': 'RAK Bank',
    'cbd': 'CBD',
    'hsbc': 'HSBC',
    'citibank': 'Citibank',
    'citi': 'Citibank',
};

const CARD_NETWORK_ALIASES = {
    'visa': 'Visa',
    'mastercard': 'Mastercard',
    'master card': 'Mastercard',
    'amex': 'Amex',
    'american express': 'Amex',
};

const MEMBERSHIP_TIER_ALIASES = {
    'gold': 'GOLD',
    'silver': 'SILVER',
    'platinum': 'PLATINUM',
    'bronze': 'BRONZE',
    'standard': 'STANDARD',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function canonicalizeLoyaltyProgram(name) {
    if (!name) return null;
    const key = cleanText(name).toLowerCase();
    return LOYALTY_PROGRAM_ALIASES[key] || key.replace(/\s+/g, '_');
}

function canonicalizeBankName(name) {
    if (!name) return null;
    const key = cleanText(name).toLowerCase();
    return BANK_CARD_ALIASES[key] || cleanText(name);
}

function canonicalizeCardNetwork(network) {
    if (!network) return null;
    const key = cleanText(network).toLowerCase();
    return CARD_NETWORK_ALIASES[key] || cleanText(network);
}

function canonicalizeMembershipTier(tier) {
    if (!tier) return null;
    const key = cleanText(tier).toLowerCase();
    return MEMBERSHIP_TIER_ALIASES[key] || cleanText(tier).toUpperCase();
}

function toPositiveNumber(val) {
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalize the raw payment request from the API/SDK layer.
 *
 * @param {object} raw
 * @param {number}  raw.requestedAmount        - Original invoice amount in AED
 * @param {string}  raw.merchantName
 * @param {string}  [raw.merchantMcc]          - ISO-18245 MCC code
 * @param {string}  [raw.merchantCategory]     - Human-readable category
 * @param {string}  [raw.currency]             - Defaults to 'AED'
 * @param {object}  [raw.userInstruments]      - User's available instruments
 * @returns {PaymentContext}
 */
export function normalizePaymentRequest(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('raw payment request must be an object');

    const requestedAmount = toPositiveNumber(raw.requestedAmount);
    if (!requestedAmount) throw new Error('requestedAmount must be a positive number');

    const merchantName = cleanText(raw.merchantName) || 'Unknown Merchant';
    const merchantMcc = cleanText(raw.merchantMcc) || null;
    const merchantCategory = cleanText(raw.merchantCategory) || null;
    const currency = cleanText(raw.currency)?.toUpperCase() || 'AED';

    const instruments = normalizeUserInstruments(raw.userInstruments || {});

    return {
        requestedAmount,
        merchantName,
        merchantMcc,
        merchantCategory,
        currency,
        instruments,
        _normalized: true,
        _normalizedAt: new Date().toISOString(),
    };
}

/**
 * Normalize a user's available payment instruments.
 *
 * @param {object} raw
 * @param {Array}  [raw.loyaltyAccounts]
 * @param {Array}  [raw.cards]
 * @param {Array}  [raw.banks]
 * @param {Array}  [raw.coupons]
 * @param {object} [raw.membership]
 * @returns {NormalizedInstruments}
 */
export function normalizeUserInstruments(raw) {
    return {
        loyaltyAccounts: normalizeLoyaltyAccounts(raw.loyaltyAccounts || []),
        cards: normalizeCards(raw.cards || []),
        banks: normalizeBanks(raw.banks || []),
        coupons: normalizeCoupons(raw.coupons || []),
        membership: normalizeMembership(raw.membership || null),
    };
}

/**
 * Normalize loyalty accounts.
 * Each account: { programName, balance, conversionRate (coins→AED) }
 */
function normalizeLoyaltyAccounts(accounts) {
    if (!Array.isArray(accounts)) return [];
    return accounts.map((acc) => {
        // Accept many field name variants from different SDKs / front-ends
        const balanceCoins = toPositiveNumber(
            acc.balanceCoins ?? acc.balance ?? acc.pointBalance ?? acc.points ?? acc.coinBalance ?? 0,
        );

        // conversionRate = coins per 1 AED for redemption (e.g. 100 means 100 pts = AED 1)
        // redemptionRate = AED per 1 coin (e.g. 0.01 means 1 pt = AED 0.01)
        let conversionRate = 100; // default
        if (acc.conversionRate) {
            conversionRate = toPositiveNumber(acc.conversionRate) || 100;
        } else if (acc.redemptionRate) {
            // redemptionRate is AED/coin → invert to get coins/AED
            const r = toPositiveNumber(acc.redemptionRate);
            conversionRate = r > 0 ? Math.round(1 / r) : 100;
        } else if (acc.pointsPerAed) {
            conversionRate = toPositiveNumber(acc.pointsPerAed) || 100;
        }

        // earnRatePerAed: coins earned per AED spent at the merchant (separate from redemption)
        const earnRatePerAed = toPositiveNumber(
            acc.earnRatePerAed ?? acc.earnRate ?? acc.pointsEarnedPerAed ?? 0,
        );

        return {
            programKey: canonicalizeLoyaltyProgram(acc.programName || acc.programId),
            programName: cleanText(acc.programName) || 'Unknown Program',
            balanceCoins,
            conversionRate,
            earnRatePerAed,
            maxRedeemableCoins: acc.maxRedeemableCoins != null ? toPositiveNumber(acc.maxRedeemableCoins) : null,
            enabled: acc.enabled !== false,
        };
    });
}

/**
 * Normalize payment cards.
 * Each card: { bankName, cardNetwork, cardType, lastFour, ibanOrAccountNo,
 *              rewardRate (AED spent → points), rewardUnit, goldMgPerAed }
 */
function normalizeCards(cards) {
    if (!Array.isArray(cards)) return [];
    return cards.map((c) => ({
        id: cleanText(c.id) ||
            `${canonicalizeBankName(c.bankName) || 'card'}_${cleanText(c.lastFour) || '0000'}`
                .toLowerCase().replace(/\s+/g, '_'),
        bankName: canonicalizeBankName(c.bankName),
        cardNetwork: canonicalizeCardNetwork(c.cardNetwork || c.network),
        cardType: cleanText(c.cardType)?.toLowerCase() || 'credit',   // 'credit' | 'debit'
        lastFour: cleanText(c.lastFour) || null,
        ibanOrAccountNo: cleanText(c.ibanOrAccountNo || c.iban) || null,
        // Reward earning: points per AED spent
        rewardRatePerAed: toPositiveNumber(c.rewardRatePerAed ?? c.rewardRate),
        rewardUnit: cleanText(c.rewardUnit) || 'points',
        // Gold rewards (mg per AED spent)
        goldMgPerAed: toPositiveNumber(c.goldMgPerAed),
        // The offer IDs from the scraped DB that apply to this card
        applicableOfferIds: Array.isArray(c.applicableOfferIds) ? c.applicableOfferIds : [],
        enabled: c.enabled !== false,
    }));
}

/**
 * Normalize discount coupons.
 * Each coupon: { code, discountType, discountValue, minSpend, maxDiscount, programName }
 */
function normalizeCoupons(coupons) {
    if (!Array.isArray(coupons)) return [];
    return coupons
        .filter((c) => c && cleanText(c.code))
        .map((c) => {
            const code = cleanText(c.code).toUpperCase();
            const discountType = normalizeDiscountType(c.discountType || c.type);
            return {
                code,
                discountType,
                discountValue: toPositiveNumber(c.discountValue ?? c.value),
                minSpend: c.minSpend != null ? toPositiveNumber(c.minSpend) : null,
                maxDiscount: c.maxDiscount != null ? toPositiveNumber(c.maxDiscount) : null,
                expiresAt: c.expiresAt || c.expires_at || null,
                programName: cleanText(c.programName) || null,
                enabled: c.enabled !== false,
            };
        });
}

/**
 * Normalize the user's membership tier.
 */
function normalizeMembership(membership) {
    if (!membership) return null;
    // Accept discountPercentage, discountPercent, discount, rate — all mean the same thing
    const discountPercent = toPositiveNumber(
        membership.discountPercent
        ?? membership.discountPercentage
        ?? membership.discount
        ?? membership.rate
        ?? 0,
    );
    return {
        tier: canonicalizeMembershipTier(membership.tier),
        programName: cleanText(membership.programName) || 'Privilege Club',
        discountPercent,
        enabled: membership.enabled !== false,
    };
}

/**
 * Normalize direct bank transfer instruments.
 * Each bank: { bankName, accountNo / ibanOrAccountNo / iban }
 */
function normalizeBanks(banks) {
    if (!Array.isArray(banks)) return [];
    return banks
        .filter((b) => b && (b.bankName || b.accountNo || b.ibanOrAccountNo || b.iban))
        .map((b) => {
            const accountNo = cleanText(b.accountNo ?? b.ibanOrAccountNo ?? b.iban) || null;
            return {
                id: cleanText(b.id) || accountNo || canonicalizeBankName(b.bankName) || null,
                bankName: canonicalizeBankName(b.bankName),
                accountNo,
                enabled: b.enabled !== false,
            };
        });
}

/**
 * Normalize discount type string.
 */
function normalizeDiscountType(type) {
    if (!type) return 'percent';
    const t = String(type).toLowerCase();
    if (t.includes('percent') || t.includes('%')) return 'percent';
    if (t.includes('fixed') || t.includes('flat') || t.includes('aed')) return 'fixed';
    if (t.includes('cashback')) return 'cashback';
    return 'percent';
}
