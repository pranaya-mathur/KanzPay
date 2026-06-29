/**
 * Advisory eligibility review for borderline offers at checkout.
 * Does not change payAmount or combination ranking.
 */
import { isAIEnabled } from './ai-recommendation.service.js';
import config from '../../config.js';

const CRAWL_COUPON_CONFIDENCE = 0.65;

/**
 * Deterministic eligibility review (no LLM) for borderline cases.
 */
export function reviewEligibility(ctx, bestCombination, applicableOffersMeta = [], mergedCoupons = []) {
    const caveats = [];
    let risk = 'low';
    let needsReview = false;

    if (!bestCombination) {
        return {
            risk: 'low',
            caveats: [],
            suggestedAction: 'none',
            eligibilityReview: null,
        };
    }

    const breakdown = bestCombination.discountBreakdown || [];
    const comboMeta = [];

    for (const layer of breakdown) {
        if (layer.type === 'coupon') {
            const coupon = resolveCouponFromLayer(layer, mergedCoupons, ctx.requestedAmount);
            if (!coupon) continue;

            const meta = applicableOffersMeta.find((m) => m.offerId && m.offerId === coupon.offerId);
            if (meta) comboMeta.push(meta);

            if (coupon.verifyRequired) {
                needsReview = true;
                caveats.push(`Coupon ${coupon.code} requires verification before payment.`);
                risk = elevateRisk(risk, 'medium');
            }
            if (!coupon.expiresAt) {
                caveats.push(`Coupon ${coupon.code} has no confirmed expiry date.`);
                risk = elevateRisk(risk, 'medium');
                needsReview = true;
            }
        }

        if (layer.type === 'cardOffer' || layer.type === 'card_offer') {
            const meta = findCardOfferMeta(layer, applicableOffersMeta);
            if (meta) comboMeta.push(meta);

            if (meta && (meta.verifyRequired || meta.validityStatus === 'unknown')) {
                needsReview = true;
                if (meta.validityStatus === 'unknown') {
                    caveats.push(`Offer "${meta.title || 'Unknown'}" has unconfirmed validity dates.`);
                    risk = elevateRisk(risk, 'high');
                } else if (meta.verifyRequired) {
                    caveats.push(`Offer "${meta.title || 'Unknown'}" should be verified on the bank website.`);
                    risk = elevateRisk(risk, 'medium');
                }
            }
        }
    }

    const uniqueComboMeta = dedupeMeta(comboMeta);
    if (uniqueComboMeta.some((m) => (m.confidence ?? 1) < CRAWL_COUPON_CONFIDENCE)) {
        caveats.push('Some offers are from public sources with low extraction confidence.');
        risk = elevateRisk(risk, 'medium');
        needsReview = true;
    }

    if (!needsReview) {
        return {
            risk: 'low',
            caveats: [],
            suggestedAction: 'proceed',
            eligibilityReview: null,
        };
    }

    const uniqueCaveats = [...new Set(caveats)];

    return {
        risk,
        caveats: uniqueCaveats,
        suggestedAction: risk === 'high' ? 'show_with_warning' : 'verify_before_pay',
        eligibilityReview: {
            risk,
            caveats: uniqueCaveats,
            suggestedAction: risk === 'high' ? 'show_with_warning' : 'verify_before_pay',
        },
    };
}

/**
 * Optional LLM-enhanced review for high-risk borderline cases.
 */
export async function reviewEligibilityWithLlm(ctx, bestCombination, applicableOffersMeta, options = {}) {
    const mergedCoupons = options.mergedCoupons || [];
    const deterministic = reviewEligibility(
        ctx,
        bestCombination,
        applicableOffersMeta,
        mergedCoupons,
    );

    const llmEnabled = config.eligibilityLlmReviewEnabled
        && !options.skipAI
        && isAIEnabled();

    if (!llmEnabled || !shouldTriggerLlmReview(deterministic, bestCombination, applicableOffersMeta, mergedCoupons, ctx)) {
        return deterministic;
    }

    try {
        const prompt = buildEligibilityPrompt(ctx, bestCombination, applicableOffersMeta);
        const client = await import('openai').then((m) => new m.default({
            apiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
        }));

        const response = await client.chat.completions.create({
            model: config.openaiEnrichmentModel,
            messages: [
                {
                    role: 'system',
                    content: 'You assess UAE payment offer eligibility risk. Return JSON only: { "risk": "low|medium|high", "caveats": ["..."], "suggestedAction": "proceed|verify_before_pay|show_with_warning" }. Do not compute discounts.',
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 300,
            response_format: { type: 'json_object' },
        });

        const raw = response.choices?.[0]?.message?.content || '';
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');

        const mergedCaveats = [...new Set([
            ...deterministic.caveats,
            ...(Array.isArray(parsed.caveats) ? parsed.caveats : []),
        ])];

        return {
            risk: parsed.risk || deterministic.risk,
            caveats: mergedCaveats,
            suggestedAction: parsed.suggestedAction || deterministic.suggestedAction,
            eligibilityReview: {
                risk: parsed.risk || deterministic.risk,
                caveats: mergedCaveats,
                suggestedAction: parsed.suggestedAction || deterministic.suggestedAction,
                aiReviewed: true,
            },
        };
    } catch {
        return deterministic;
    }
}

function shouldTriggerLlmReview(deterministic, bestCombination, applicableOffersMeta, mergedCoupons, ctx) {
    if (deterministic.risk === 'high') return true;
    if (deterministic.risk !== 'medium' || !bestCombination) return false;

    const breakdown = bestCombination.discountBreakdown || [];
    for (const layer of breakdown) {
        if (layer.type === 'coupon') {
            const coupon = resolveCouponFromLayer(layer, mergedCoupons, ctx.requestedAmount);
            if (coupon?.verifyRequired) return true;
        }
        if (layer.type === 'cardOffer' || layer.type === 'card_offer') {
            const meta = findCardOfferMeta(layer, applicableOffersMeta);
            if (meta?.verifyRequired) return true;
        }
    }
    return false;
}

function buildEligibilityPrompt(ctx, best, meta) {
    return JSON.stringify({
        merchant: ctx.merchantName,
        amount: ctx.requestedAmount,
        bestCombination: {
            payAmount: best.payAmount,
            totalDiscount: best.totalDiscount,
            discountBreakdown: best.discountBreakdown,
        },
        applicableOffers: meta.filter((m) => m.verifyRequired || m.validityStatus === 'unknown'),
    }, null, 2);
}

function resolveCouponFromLayer(layer, mergedCoupons = [], requestedAmount = 0) {
    const label = layer.label || '';
    const codeCandidates = [];

    const parenMatch = label.match(/\(([A-Z0-9_-]+)\)/i);
    if (parenMatch) codeCandidates.push(parenMatch[1]);

    const leadMatch = label.match(/^([A-Z0-9_-]+)/i);
    if (leadMatch) codeCandidates.push(leadMatch[1]);

    for (const code of codeCandidates) {
        const found = mergedCoupons.find((c) => c.code?.toUpperCase() === code.toUpperCase());
        if (found) return found;
    }

    if (layer.discountAed != null && mergedCoupons.length > 0) {
        const matches = mergedCoupons.filter((c) => {
            const expected = estimateCouponDiscount(c, requestedAmount);
            return expected != null && Math.abs(expected - layer.discountAed) < 0.02;
        });
        if (matches.length === 1) return matches[0];
    }

    return null;
}

function estimateCouponDiscount(coupon, amount) {
    if (!coupon || amount <= 0) return null;
    let discount = 0;
    if (coupon.discountType === 'percent') {
        discount = amount * (Number(coupon.discountValue) / 100);
    } else if (coupon.discountType === 'fixed') {
        discount = Number(coupon.discountValue);
    } else {
        discount = amount * (Number(coupon.discountValue) / 100);
    }
    if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
    return Math.min(discount, amount);
}

function findCardOfferMeta(layer, applicableOffersMeta) {
    const label = layer.label || '';
    return applicableOffersMeta.find((m) =>
        m.type !== 'coupon'
        && m.title
        && label.includes(m.title),
    ) || null;
}

function dedupeMeta(metaList) {
    const seen = new Set();
    return metaList.filter((m) => {
        const key = m.offerId || m.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function elevateRisk(current, next) {
    const order = { low: 0, medium: 1, high: 2 };
    return order[next] > order[current] ? next : current;
}
