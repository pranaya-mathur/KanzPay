/**
 * @file rules-engine.service.js
 * Payment rules engine for KanzPay.
 *
 * Given a normalized PaymentContext (from normalization.service.js) and the
 * merchant's applicable offers (from the offers DB), this engine:
 *
 *   1. Evaluates eligibility of each instrument/offer against the request
 *   2. Calculates discounts (loyalty, coupon, membership) with stacking rules
 *   3. Calculates rewards earned per card
 *   4. Enumerates all valid payment combinations ranked by net benefit
 *
 * The output is a CombinationsResult consumed by the AI recommendation layer.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

// Stacking policy: which discount types can be combined.
// Order matters: loyalty → coupon → membership → card-offer
const STACKABLE_LAYERS = ['loyalty', 'coupon', 'membership', 'cardOffer'];

// Maximum discount cap as fraction of requested amount (safety guard)
const MAX_DISCOUNT_RATIO = 0.90;

// ─── Eligibility checks ───────────────────────────────────────────────────────

/**
 * Check whether a loyalty account can be redeemed in this transaction.
 * @param {object} account  - Normalized loyalty account
 * @param {number} amount   - Requested amount in AED
 * @returns {{ eligible: boolean, reason?: string, redeemableCoins: number, aedValue: number }}
 */
function evaluateLoyaltyEligibility(account, amount) {
    if (!account.enabled) return { eligible: false, reason: 'account_disabled', redeemableCoins: 0, aedValue: 0 };
    if (account.balanceCoins <= 0) return { eligible: false, reason: 'no_balance', redeemableCoins: 0, aedValue: 0 };

    const maxByBalance = account.balanceCoins;
    const maxByCap = account.maxRedeemableCoins ?? Infinity;
    // Can't redeem more value than the transaction amount
    const maxByAmount = amount * account.conversionRate;

    const redeemableCoins = Math.min(maxByBalance, maxByCap, maxByAmount);
    const aedValue = redeemableCoins / account.conversionRate;

    if (aedValue < 0.01) return { eligible: false, reason: 'below_minimum_value', redeemableCoins: 0, aedValue: 0 };

    return { eligible: true, redeemableCoins: Math.floor(redeemableCoins), aedValue: round2(aedValue) };
}

/**
 * Check whether a coupon is valid for this transaction.
 * @param {object} coupon           - Normalized coupon
 * @param {number} amount           - Amount the coupon is applied on (remaining after loyalty)
 * @param {number} [originalAmount] - Original basket value for min-spend gating (defaults to amount)
 * @returns {{ eligible: boolean, reason?: string, discountAed: number }}
 */
function evaluateCouponEligibility(coupon, amount, originalAmount = amount) {
    if (!coupon.enabled) return { eligible: false, reason: 'coupon_disabled', discountAed: 0 };
    if (coupon.expiresAt && isExpiredDate(coupon.expiresAt)) {
        return { eligible: false, reason: 'coupon_expired', discountAed: 0 };
    }
    // Min-spend is always checked against original basket — not post-loyalty remainder
    if (coupon.minSpend != null && originalAmount < coupon.minSpend) {
        return { eligible: false, reason: `min_spend_not_met:${coupon.minSpend}`, discountAed: 0 };
    }

    let discountAed = 0;
    if (coupon.discountType === 'percent') {
        discountAed = amount * (coupon.discountValue / 100);
    } else if (coupon.discountType === 'fixed') {
        discountAed = coupon.discountValue;
    } else {
        discountAed = amount * (coupon.discountValue / 100);
    }

    if (coupon.maxDiscount != null) discountAed = Math.min(discountAed, coupon.maxDiscount);
    discountAed = Math.min(discountAed, amount);
    discountAed = round2(discountAed);

    if (discountAed <= 0) return { eligible: false, reason: 'zero_discount', discountAed: 0 };

    return { eligible: true, discountAed };
}

/**
 * Check whether the membership tier provides a discount on this transaction.
 * @param {object} membership - Normalized membership
 * @param {number} amount     - Amount *after* prior discounts (post-loyalty, post-coupon)
 * @returns {{ eligible: boolean, reason?: string, discountAed: number }}
 */
function evaluateMembershipEligibility(membership, amount) {
    if (!membership || !membership.enabled) return { eligible: false, reason: 'no_membership', discountAed: 0 };
    if (membership.discountPercent <= 0) return { eligible: false, reason: 'zero_discount', discountAed: 0 };

    const discountAed = round2(amount * (membership.discountPercent / 100));
    if (discountAed <= 0) return { eligible: false, reason: 'zero_discount', discountAed: 0 };

    return { eligible: true, discountAed };
}

/**
 * Check whether a scraped card offer applies to this merchant + card.
 * @param {object} offer  - Offer record from DB (normalized)
 * @param {object} card   - Normalized card
 * @param {object} ctx    - PaymentContext
 * @returns {{ eligible: boolean, reason?: string, discountAed: number }}
 */
function evaluateCardOfferEligibility(offer, card, ctx) {
    if ((offer.categories || []).includes('touchpoints_burn')) {
        return { eligible: false, reason: 'touchpoints_burn_excluded', discountAed: 0 };
    }
    // Reject generic page headers that have no merchant scope and no bank scope.
    // These are scraped category pages (e.g. "Cards & Rewards"), not real card offers.
    if (!offer.merchantName && !offer.bankName) {
        return { eligible: false, reason: 'offer_too_generic', discountAed: 0 };
    }
    // Bank match
    if (offer.bankName && card.bankName &&
        !bankNamesMatch(offer.bankName, card.bankName)) {
        return { eligible: false, reason: 'bank_mismatch', discountAed: 0 };
    }
    // Card network match
    if (offer.cardName && card.cardNetwork &&
        !offer.cardName.toLowerCase().includes(card.cardNetwork.toLowerCase())) {
        return { eligible: false, reason: 'card_network_mismatch', discountAed: 0 };
    }
    // Merchant match (if offer scoped to specific merchant)
    if (offer.merchantName && ctx.merchantName &&
        !fuzzyMerchantMatch(offer.merchantName, ctx.merchantName)) {
        return { eligible: false, reason: 'merchant_mismatch', discountAed: 0 };
    }
    // MCC match
    if (offer.eligibleMccList?.length && ctx.merchantMcc &&
        !offer.eligibleMccList.includes(ctx.merchantMcc)) {
        return { eligible: false, reason: 'mcc_mismatch', discountAed: 0 };
    }
    // Min spend
    if (offer.minSpend != null && ctx.requestedAmount < offer.minSpend) {
        return { eligible: false, reason: `min_spend_not_met:${offer.minSpend}`, discountAed: 0 };
    }
    // Validity status and verification gates
    if (offer.validityStatus === 'expired') {
        return { eligible: false, reason: 'offer_expired', discountAed: 0 };
    }
    if (offer.validityStatus === 'not_yet_active') {
        return { eligible: false, reason: 'offer_not_yet_active', discountAed: 0 };
    }
    if (offer.validityStatus === 'unknown') {
        return { eligible: false, reason: 'offer_validity_unknown', discountAed: 0 };
    }
    if (offer.verifyRequired) {
        return { eligible: false, reason: 'offer_verify_required', discountAed: 0 };
    }
    if (offer.validFrom && isFutureDate(offer.validFrom)) {
        return { eligible: false, reason: 'offer_not_yet_active', discountAed: 0 };
    }
    // Freshness
    if (offer.freshnessStatus === 'stale') {
        return { eligible: false, reason: 'stale_offer', discountAed: 0 };
    }
    // Validity window
    const now = new Date();
    if (offer.validTo && new Date(offer.validTo) < now) {
        return { eligible: false, reason: 'offer_expired', discountAed: 0 };
    }

    // Calculate discount
    let discountAed = 0;
    const amount = ctx.requestedAmount;
    if (offer.discountType === 'percent' && offer.discountValue) {
        discountAed = amount * (Number(offer.discountValue) / 100);
    } else if (offer.discountType === 'fixed' && offer.discountValue) {
        discountAed = Number(offer.discountValue);
    } else if (offer.discountType === 'cashback' && offer.discountValue) {
        discountAed = amount * (Number(offer.discountValue) / 100);
    }
    if (offer.capValue != null) discountAed = Math.min(discountAed, offer.capValue);
    discountAed = Math.min(discountAed, amount);
    discountAed = round2(discountAed);

    return { eligible: discountAed > 0, discountAed };
}

// ─── Reward calculation ───────────────────────────────────────────────────────

/**
 * Calculate rewards earned by paying with a given card.
 * @param {object} card         - Normalized card
 * @param {number} amountPaid   - Amount charged to the card (post all discounts)
 * @returns {object} rewards breakdown
 */
function calculateCardRewards(card, amountPaid) {
    const rewards = {};

    if (card.rewardRatePerAed > 0) {
        const points = Math.floor(amountPaid * card.rewardRatePerAed);
        if (points > 0) {
            rewards[card.rewardUnit || 'points'] = points;
        }
    }

    if (card.goldMgPerAed > 0) {
        const goldMg = round2(amountPaid * card.goldMgPerAed);
        if (goldMg > 0) rewards.goldMg = goldMg;
    }

    return rewards;
}

// ─── Combination builder ──────────────────────────────────────────────────────

/**
 * Build a single payment combination and compute its net economics.
 *
 * @param {object}   ctx               - Normalized PaymentContext
 * @param {object}   opts
 * @param {object}   [opts.loyalty]    - Loyalty account to use (or null)
 * @param {object}   [opts.coupon]     - Coupon to use (or null)
 * @param {boolean}  [opts.membership] - Whether to apply membership discount
 * @param {object}   [opts.card]       - Card to pay with (mutually exclusive with bank)
 * @param {object}   [opts.bank]       - Bank account to pay with (mutually exclusive with card)
 * @param {object[]} [opts.cardOffers] - Applicable DB offers for this card
 * @returns {Combination}
 */
function buildCombination(ctx, opts = {}) {
    const { loyalty, coupon, membership: useMembership, card, bank = null, cardOffers = [] } = opts;
    const baseMembership = ctx.instruments.membership;

    let remainingAmount = ctx.requestedAmount;
    const discountBreakdown = [];
    let totalDiscount = 0;

    // ── Layer 1: Loyalty redemption ──────────────────────────────────────────
    let loyaltyResult = null;
    if (loyalty) {
        const result = evaluateLoyaltyEligibility(loyalty, remainingAmount);
        if (result.eligible) {
            loyaltyResult = result;
            discountBreakdown.push({
                type: 'loyalty',
                label: `${loyalty.programName} (${result.redeemableCoins} coins)`,
                discountAed: result.aedValue,
            });
            totalDiscount += result.aedValue;
            remainingAmount = round2(remainingAmount - result.aedValue);
        }
    }

    // ── Layer 2: Coupon ──────────────────────────────────────────────────────
    // Coupon applies to the remaining balance AFTER loyalty is deducted.
    // Min-spend eligibility is checked against the original basket value so that
    // redeeming points doesn't disqualify a coupon (e.g. AED 200 basket with
    // AED 40 points → AED 160 remaining; coupon 10% = AED 16, not AED 20).
    let couponResult = null;
    if (coupon) {
        const result = evaluateCouponEligibility(coupon, remainingAmount, ctx.requestedAmount);
        if (result.eligible) {
            couponResult = result;
            discountBreakdown.push({
                type: 'coupon',
                label: `${coupon.programName || coupon.code} (${formatCouponDiscount(coupon)})`,
                discountAed: result.discountAed,
            });
            totalDiscount += result.discountAed;
            remainingAmount = round2(remainingAmount - result.discountAed);
        }
    }

    // ── Layer 3: Membership ──────────────────────────────────────────────────
    let membershipResult = null;
    if (useMembership && baseMembership) {
        // Membership applies on remaining balance after loyalty+coupon
        const result = evaluateMembershipEligibility(baseMembership, remainingAmount);
        if (result.eligible) {
            membershipResult = result;
            discountBreakdown.push({
                type: 'membership',
                label: `${baseMembership.programName} ${baseMembership.tier} (${baseMembership.discountPercent}% flat)`,
                discountAed: result.discountAed,
            });
            totalDiscount += result.discountAed;
            remainingAmount = round2(remainingAmount - result.discountAed);
        }
    }

    // ── Layer 4: Card offer (bank/card-linked) ───────────────────────────────
    let cardOfferResult = null;
    if (card && cardOffers.length) {
        // Pick the single best applicable card offer (no double-dipping)
        let bestOfferDiscount = 0;
        let bestOffer = null;
        for (const offer of cardOffers) {
            const result = evaluateCardOfferEligibility(offer, card, ctx);
            if (result.eligible && result.discountAed > bestOfferDiscount) {
                bestOfferDiscount = result.discountAed;
                bestOffer = offer;
            }
        }
        if (bestOffer && bestOfferDiscount > 0) {
            cardOfferResult = { offer: bestOffer, discountAed: bestOfferDiscount };
            discountBreakdown.push({
                type: 'cardOffer',
                label: bestOffer.offerTitle || `${card.bankName} card offer`,
                discountAed: bestOfferDiscount,
            });
            totalDiscount += bestOfferDiscount;
            remainingAmount = round2(remainingAmount - bestOfferDiscount);
        }
    }

    // ── Safety cap ───────────────────────────────────────────────────────────
    const maxAllowedDiscount = round2(ctx.requestedAmount * MAX_DISCOUNT_RATIO);
    if (totalDiscount > maxAllowedDiscount) {
        const excess = totalDiscount - maxAllowedDiscount;
        totalDiscount = maxAllowedDiscount;
        remainingAmount = round2(ctx.requestedAmount - totalDiscount);
        // Trim the last discount layer proportionally (simplified: trim last entry)
        if (discountBreakdown.length) {
            discountBreakdown[discountBreakdown.length - 1].discountAed = round2(
                discountBreakdown[discountBreakdown.length - 1].discountAed - excess,
            );
        }
    }

    const payAmount = Math.max(0, round2(remainingAmount));

    // ── Card rewards earned ──────────────────────────────────────────────────
    // Banks award points on "qualifying spend" — the card-charged amount minus
    // merchant-side price reductions (coupon + membership). Those are absorbed
    // by the merchant, so the bank doesn't see them as real card spend.
    // Loyalty redemption stays in the base: the card still processes that charge.
    const externalDiscounts = round2(
        discountBreakdown
            .filter((d) => d.type === 'coupon' || d.type === 'membership')
            .reduce((sum, d) => sum + d.discountAed, 0),
    );
    const cardEarnBase = round2(Math.max(0, payAmount - externalDiscounts));
    const rewardsEarned = card ? calculateCardRewards(card, cardEarnBase) : {};

    // ── Merchant loyalty earn (coins earned on this spend, separate from redemption) ──
    const loyaltyEarned = {};
    for (const account of (ctx.instruments.loyaltyAccounts || [])) {
        if (account.enabled && account.earnRatePerAed > 0) {
            const earned = Math.floor(payAmount * account.earnRatePerAed);
            if (earned > 0) loyaltyEarned[account.programKey] = earned;
        }
    }

    const loyaltyRedeemed = loyalty && loyaltyResult
        ? { coinsRedeemed: loyaltyResult.redeemableCoins }
        : null;

    return {
        card: card ? {
            id: card.id,
            bankName: card.bankName,
            cardNetwork: card.cardNetwork,
            lastFour: card.lastFour,
            ibanOrAccountNo: card.ibanOrAccountNo,
        } : null,
        bank: bank ? {
            id: bank.id,
            bankName: bank.bankName,
            accountNo: bank.accountNo,
        } : null,
        discountBreakdown,
        totalDiscount: round2(totalDiscount),
        payAmount,
        rewardsEarned,
        loyaltyEarned,
        loyaltyRedeemed,
        // Score = total AED saved (used for ranking)
        score: round2(totalDiscount),
        // Whether all stackable layers are active
        fullyStacked: !!(loyalty && coupon && useMembership),
    };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Evaluate all valid payment combinations for a normalized PaymentContext.
 *
 * @param {object}   ctx              - Output of normalizePaymentRequest()
 * @param {object[]} [applicableOffers] - Offers from DB scoped to this merchant/MCC
 * @returns {CombinationsResult}
 */
export function evaluatePaymentCombinations(ctx, applicableOffers = []) {
    const { instruments, requestedAmount } = ctx;
    const { loyaltyAccounts, cards, banks = [], coupons, membership } = instruments;

    const combinations = [];

    const cardOptions = cards.filter((c) => c.enabled);
    const bankOptions = banks.filter((b) => b.enabled);
    const loyaltyOptions = [null, ...loyaltyAccounts.filter((a) => a.enabled && a.balanceCoins > 0)];
    const couponOptions = [null, ...coupons.filter((c) => c.enabled)];
    const membershipOptions = membership?.enabled ? [false, true] : [false];

    // Card combinations: card × loyalty × coupon × membership
    for (const card of cardOptions) {
        // Only pass offers that are scoped to this specific card's bank or merchant
        const cardOffers = applicableOffers.filter((o) => isOfferForCard(o, card));

        for (const loyalty of loyaltyOptions) {
            for (const coupon of couponOptions) {
                for (const useMembership of membershipOptions) {
                    const combo = buildCombination(ctx, {
                        loyalty,
                        coupon,
                        membership: useMembership,
                        card,
                        cardOffers,
                    });
                    if (combo.payAmount <= requestedAmount) {
                        combinations.push(combo);
                    }
                }
            }
        }
    }

    // Bank combinations: one per bank × loyalty × coupon × membership
    // Banks earn no card rewards but still benefit from discount stacking.
    // Include even with zero discount so every bank appears in instrumentSelection.
    const bankChoices = bankOptions.length > 0 ? bankOptions : [null];
    for (const bank of bankChoices) {
        for (const loyalty of loyaltyOptions) {
            for (const coupon of couponOptions) {
                for (const useMembership of membershipOptions) {
                    const combo = buildCombination(ctx, { loyalty, coupon, membership: useMembership, bank });
                    if (combo.payAmount <= requestedAmount) {
                        combinations.push(combo);
                    }
                }
            }
        }
    }

    // Deduplicate on (card id, bank id, total discount, active layer types) then sort by score DESC.
    // Including layer types prevents two combinations with the same discount AED but different
    // discount structures (e.g. coupon-only vs membership-only) from being collapsed.
    const seen = new Set();
    const unique = combinations.filter((c) => {
        const layers = c.discountBreakdown.map((d) => d.type).sort().join(',');
        const key = `${c.card?.id ?? 'none'}::${c.bank?.id ?? 'none'}::${c.totalDiscount}::${layers}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    unique.sort((a, b) => b.score - a.score);

    const best = unique[0] || null;

    return {
        requestedAmount,
        currency: ctx.currency,
        merchantName: ctx.merchantName,
        combinations: unique,
        bestCombination: best,
        totalCombinationsEvaluated: combinations.length,
    };
}

/**
 * Build a summary of what each card earns in rewards (for the payment UI picker).
 * @param {object[]} cards         - Normalized cards
 * @param {number}   amountAed     - Amount the card would be charged
 * @returns {object[]}
 */
export function summarizeCardRewards(cards, amountAed) {
    return cards.map((card) => ({
        id: card.id,
        bankName: card.bankName,
        cardNetwork: card.cardNetwork,
        lastFour: card.lastFour,
        rewards: calculateCardRewards(card, amountAed),
        opportunityLabel: buildOpportunityLabel(calculateCardRewards(card, amountAed)),
    }));
}

/**
 * Build the grouped instrument-selection view for the payment UI.
 *
 * Returns two groups ("Pay by Bank", "Pay by Card") with every instrument the
 * user supplied, each annotated with its best achievable payAmount, the
 * discount breakdown, rewards earned, and a `recommended` flag matching the
 * rules engine's top pick.
 *
 * @param {object} ctx                - Output of normalizePaymentRequest()
 * @param {object} combinationsResult - Output of evaluatePaymentCombinations()
 * @returns {InstrumentSelection}
 */
export function buildInstrumentSelection(ctx, combinationsResult) {
    const { instruments } = ctx;
    const allCombos = combinationsResult.combinations;
    const best = combinationsResult.bestCombination;
    const recommendedCardId = best?.card?.id ?? null;
    const recommendedBankId = !recommendedCardId ? (best?.bank?.id ?? null) : null;

    // Best combination for a specific card
    const bestForCard = (cardId) =>
        allCombos
            .filter((c) => c.card?.id === cardId)
            .sort((a, b) => b.score - a.score)[0] ?? null;

    // Best combination for a specific bank (no card)
    const bestForBank = (bankId) =>
        allCombos
            .filter((c) => !c.card && c.bank?.id === bankId)
            .sort((a, b) => b.score - a.score)[0] ?? null;

    const cardItems = (instruments.cards || []).filter((c) => c.enabled).map((card) => {
        const combo = bestForCard(card.id);
        const rewards = combo?.rewardsEarned ?? {};
        const loyaltyEarned = combo?.loyaltyEarned ?? {};
        return {
            type: 'card',
            id: card.id,
            bankName: card.bankName,
            cardNetwork: card.cardNetwork,
            lastFour: card.lastFour,
            recommended: card.id === recommendedCardId,
            selected: card.id === recommendedCardId,
            payAmount: combo?.payAmount ?? ctx.requestedAmount,
            totalDiscount: combo?.totalDiscount ?? 0,
            discountBreakdown: combo?.discountBreakdown ?? [],
            rewardsEarned: rewards,
            loyaltyEarned,
            opportunityLabel: buildOpportunityLabel(rewards),
        };
    });

    const bankItems = (instruments.banks || []).filter((b) => b.enabled).map((bank) => {
        const combo = bestForBank(bank.id);
        const loyaltyEarned = combo?.loyaltyEarned ?? {};
        return {
            type: 'bank',
            id: bank.id,
            bankName: bank.bankName,
            accountNo: bank.accountNo,
            recommended: bank.id === recommendedBankId,
            selected: bank.id === recommendedBankId,
            payAmount: combo?.payAmount ?? ctx.requestedAmount,
            totalDiscount: combo?.totalDiscount ?? 0,
            discountBreakdown: combo?.discountBreakdown ?? [],
            rewardsEarned: {},
            loyaltyEarned,
            opportunityLabel: '0 points',
        };
    });

    const groups = [];
    if (bankItems.length) groups.push({ label: 'Pay by Bank', instruments: bankItems });
    if (cardItems.length) groups.push({ label: 'Pay by Card', instruments: cardItems });

    return {
        recommendedType: recommendedCardId ? 'card' : (recommendedBankId ? 'bank' : null),
        recommendedId: recommendedCardId ?? recommendedBankId,
        groups,
    };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isExpiredDate(value) {
    const d = new Date(String(value).slice(0, 10));
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < today;
}

function isFutureDate(value) {
    const d = new Date(String(value).slice(0, 10));
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d > today;
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function isOfferForCard(offer, card) {
    if ((offer.categories || []).includes('touchpoints_burn')) return false;
    if (offer.bankName && card.bankName && bankNamesMatch(offer.bankName, card.bankName)) return true;
    if (!offer.bankName && offer.cardName && card.cardNetwork
        && offer.cardName.toLowerCase().includes(card.cardNetwork.toLowerCase())) {
        return true;
    }
    return false;
}

function bankNamesMatch(a, b) {
    if (!a || !b) return true; // if one is missing, don't filter
    return a.toLowerCase().replace(/\s+/g, '') === b.toLowerCase().replace(/\s+/g, '');
}

function fuzzyMerchantMatch(offerMerchant, requestMerchant) {
    const a = offerMerchant.toLowerCase().replace(/[^a-z0-9]/g, '');
    const b = requestMerchant.toLowerCase().replace(/[^a-z0-9]/g, '');
    return a.includes(b) || b.includes(a);
}

function formatCouponDiscount(coupon) {
    if (coupon.discountType === 'fixed') return `AED ${coupon.discountValue} off`;
    return `${coupon.discountValue}% flat`;
}

function buildOpportunityLabel(rewards) {
    const parts = [];
    for (const [unit, value] of Object.entries(rewards)) {
        if (unit === 'goldMg') parts.push(`${value} mg GOLD`);
        else parts.push(`${value} ${unit}`);
    }
    return parts.length ? parts.join(' + ') : '0 points';
}
