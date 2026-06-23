/**
 * @file ai-recommendation.service.js
 * OpenAI recommendation layer for KanzPay payment optimization.
 *
 * Takes the CombinationsResult from the rules engine and calls GPT-4o to:
 *   1. Rank the top combinations by holistic net benefit
 *   2. Explain the recommended choice in plain, friendly language
 *   3. Highlight what the user earns (rewards, gold, points)
 *   4. Surface any caveats or time-sensitive factors
 *
 * Falls back gracefully to the rules-engine's deterministic top pick when
 * the OpenAI call fails (network error, rate limit, etc.).
 */

import OpenAI from 'openai';
import logger from '../../shared/utils/logger.js';
import config from '../../config.js';

let _client = null;

function getClient() {
    if (!_client) {
        const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
        _client = new OpenAI({ apiKey });
    }
    return _client;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build the system prompt that explains KanzPay's context to the model.
 */
function buildSystemPrompt() {
    return `You are KanzPay AI, an intelligent payment optimization assistant for the UAE market.
Your job is to analyze a customer's payment options and recommend the single best way to pay,
maximizing savings while clearly explaining what they earn.

Guidelines:
- Always respond in valid JSON matching the schema provided.
- Prioritize cash savings (lower payAmount) over reward accumulation.
- When savings are equal, prefer the combination that earns the most valuable rewards (gold > points > cashback).
- Be specific: mention exact AED savings, reward units, and gold grams.
- Keep the explanation friendly, concise, and under 60 words.
- If a time-sensitive coupon or expiring offer is used, flag it as a caveat.
- Currency is AED unless stated otherwise.`;
}

/**
 * Build the user prompt with the specific payment scenario.
 *
 * @param {object} ctx              - Normalized PaymentContext
 * @param {object} combinationsResult - Output of evaluatePaymentCombinations()
 * @returns {string}
 */
function buildUserPrompt(ctx, combinationsResult) {
    const { requestedAmount, merchantName, currency, combinations } = combinationsResult;

    // Only send the top 5 combinations to keep token count manageable
    const topCombos = combinations.slice(0, 5).map((c, i) => ({
        rank: i + 1,
        card: c.card ? `${c.card.bankName} ${c.card.cardNetwork} (****${c.card.lastFour || c.card.ibanOrAccountNo || ''})` : 'Bank Transfer',
        discountBreakdown: c.discountBreakdown,
        totalDiscount: `${currency} ${c.totalDiscount}`,
        payAmount: `${currency} ${c.payAmount}`,
        rewardsEarned: c.rewardsEarned,
        loyaltyRedeemed: c.loyaltyRedeemed,
    }));

    const instruments = ctx.instruments;
    const availableCards = instruments.cards.filter((c) => c.enabled).map((c) =>
        `${c.bankName} ${c.cardNetwork} (****${c.lastFour || c.ibanOrAccountNo || ''}, ${c.rewardRatePerAed} pts/AED${c.goldMgPerAed ? `, ${c.goldMgPerAed} mg gold/AED` : ''})`,
    );
    const availableBanks = (instruments.banks || []).filter((b) => b.enabled).map((b) =>
        `${b.bankName} (${b.accountNo || 'direct transfer'}, no card rewards)`,
    );
    const availableLoyalty = instruments.loyaltyAccounts.filter((a) => a.enabled).map((a) =>
        `${a.programName}: ${a.balanceCoins} coins (${a.conversionRate} coins = 1 AED)`,
    );
    const availableCoupons = instruments.coupons.filter((c) => c.enabled).map((c) =>
        `${c.code}: ${c.discountValue}% off${c.minSpend ? ` (min spend AED ${c.minSpend})` : ''}`,
    );
    const membership = instruments.membership?.enabled
        ? `${instruments.membership.programName} ${instruments.membership.tier}: ${instruments.membership.discountPercent}% off`
        : 'None';

    return `Payment Request Details:
- Merchant: ${merchantName}
- Requested Amount: ${currency} ${requestedAmount}

Available Instruments:
- Cards: ${availableCards.join('; ') || 'None'}
- Banks: ${availableBanks.join('; ') || 'None'}
- Loyalty Accounts: ${availableLoyalty.join('; ') || 'None'}
- Coupons: ${availableCoupons.join('; ') || 'None'}
- Membership: ${membership}

Top Payment Combinations (pre-computed by rules engine):
${JSON.stringify(topCombos, null, 2)}

Task: Analyze these combinations and return your recommendation in the following JSON schema:
{
  "recommendedRank": <number, 1-indexed from the list above>,
  "summary": "<one sentence: best option headline>",
  "explanation": "<2-3 sentences explaining why this is best, what they save, what they earn>",
  "savingsHighlight": "<e.g. 'Save AED 70 (35%)'>",
  "rewardsHighlight": "<e.g. '100 ABC Points + 200 ADCB Points + 1.30 mg GOLD'>",
  "caveats": ["<any time-sensitive or conditional notes>"],
  "alternativeRank": <number or null, second-best option if meaningfully different>
}`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseAIResponse(content) {
    try {
        // Extract JSON from the response (model may wrap it in markdown)
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON object found in response');
        return JSON.parse(match[0]);
    } catch (err) {
        logger.warn('Failed to parse AI response JSON', { err: err.message, content });
        return null;
    }
}

// ─── Fallback recommendation ──────────────────────────────────────────────────

/**
 * Build a deterministic recommendation from the rules engine output alone.
 * Used when the OpenAI call fails.
 */
function buildFallbackRecommendation(combinationsResult) {
    const best = combinationsResult.bestCombination;
    if (!best) {
        return {
            aiPowered: false,
            fallback: true,
            message: 'No discount combinations available for this transaction.',
            recommendedCombination: null,
        };
    }

    const savingsPct = combinationsResult.requestedAmount > 0
        ? Math.round((best.totalDiscount / combinationsResult.requestedAmount) * 100)
        : 0;

    const rewardParts = Object.entries(best.rewardsEarned || {}).map(([unit, val]) =>
        unit === 'goldMg' ? `${val} mg GOLD` : `${val} ${unit}`,
    );

    return {
        aiPowered: false,
        fallback: true,
        recommendedRank: 1,
        summary: `Pay ${combinationsResult.currency} ${best.payAmount} and save ${combinationsResult.currency} ${best.totalDiscount}`,
        explanation: `Apply all available discounts to reduce your payment from ${combinationsResult.currency} ${combinationsResult.requestedAmount} to ${combinationsResult.currency} ${best.payAmount}.`,
        savingsHighlight: `Save ${combinationsResult.currency} ${best.totalDiscount} (${savingsPct}%)`,
        rewardsHighlight: rewardParts.join(' + ') || 'No additional rewards',
        caveats: [],
        alternativeRank: combinationsResult.combinations.length > 1 ? 2 : null,
        recommendedCombination: best,
        allCombinations: combinationsResult.combinations,
    };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Get an AI-powered payment recommendation.
 *
 * @param {object} ctx                - Normalized PaymentContext
 * @param {object} combinationsResult - Output of evaluatePaymentCombinations()
 * @param {object} [options]
 * @param {string} [options.model]    - OpenAI model (default: gpt-4o)
 * @param {number} [options.timeout]  - Request timeout ms (default: 10000)
 * @returns {Promise<RecommendationResult>}
 */
export async function getAIRecommendation(ctx, combinationsResult, options = {}) {
    const model = options.model || config.openaiModel || 'gpt-4o';
    const timeout = options.timeout || 10000;

    if (!combinationsResult.combinations?.length) {
        return buildFallbackRecommendation(combinationsResult);
    }

    try {
        const client = getClient();

        const response = await Promise.race([
            client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: buildSystemPrompt() },
                    { role: 'user', content: buildUserPrompt(ctx, combinationsResult) },
                ],
                temperature: 0.2,   // Low temperature for consistent financial advice
                max_tokens: 512,
                response_format: { type: 'json_object' },
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('OpenAI request timed out')), timeout),
            ),
        ]);

        const rawContent = response.choices?.[0]?.message?.content || '';
        const parsed = parseAIResponse(rawContent);

        if (!parsed) {
            logger.warn('AI response unparseable, falling back to rules engine');
            return buildFallbackRecommendation(combinationsResult);
        }

        // Map recommendedRank (1-indexed) back to combination
        const recIndex = Math.max(0, (parsed.recommendedRank || 1) - 1);
        const altIndex = parsed.alternativeRank != null ? Math.max(0, parsed.alternativeRank - 1) : null;

        return {
            aiPowered: true,
            fallback: false,
            model,
            recommendedRank: parsed.recommendedRank || 1,
            summary: parsed.summary || '',
            explanation: parsed.explanation || '',
            savingsHighlight: parsed.savingsHighlight || '',
            rewardsHighlight: parsed.rewardsHighlight || '',
            caveats: Array.isArray(parsed.caveats) ? parsed.caveats : [],
            alternativeRank: parsed.alternativeRank || null,
            recommendedCombination: combinationsResult.combinations[recIndex] || combinationsResult.bestCombination,
            alternativeCombination: altIndex != null ? (combinationsResult.combinations[altIndex] || null) : null,
            allCombinations: combinationsResult.combinations,
            usage: response.usage || null,
        };
    } catch (err) {
        logger.error('OpenAI recommendation failed, using fallback', {
            error: err.message,
            merchant: ctx.merchantName,
        });
        return buildFallbackRecommendation(combinationsResult);
    }
}

/**
 * Lightweight check: is the OpenAI integration configured?
 * @returns {boolean}
 */
export function isAIEnabled() {
    return !!(config.openaiApiKey || process.env.OPENAI_API_KEY);
}
