/**
 * LLM-based extraction of missing offer eligibility fields from crawl text.
 */
import OpenAI from 'openai';
import config from '../../config.js';
import logger from '../../shared/utils/logger.js';
import { parseOfferEnrichmentResult } from './offer-enrichment.schema.js';

let _client = null;

function getClient() {
    if (!_client) {
        const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
        _client = new OpenAI({ apiKey });
    }
    return _client;
}

export function isEnrichmentAvailable() {
    return !!(config.openaiApiKey || process.env.OPENAI_API_KEY);
}

export function isRetryableError(err) {
    const message = String(err?.message || '').toLowerCase();
    const status = err?.status || err?.response?.status;
    if (status === 429 || status === 503) return true;
    if (message.includes('429') || message.includes('503')) return true;
    if (message.includes('timed out') || message.includes('timeout')) return true;
    if (message.includes('rate limit')) return true;
    return false;
}

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry(fn, options = {}) {
    const maxAttempts = options.maxAttempts ?? config.enrichmentMaxRetries ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 500;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            if (attempt === maxAttempts || !isRetryableError(err)) throw err;
            await sleep(baseDelayMs * (2 ** (attempt - 1)));
        }
    }
    return null;
}

function buildSystemPrompt() {
    return `You extract structured UAE bank/merchant offer eligibility fields from crawled page text.
Rules:
- Only extract values explicitly supported by the page text. Use null when unknown.
- Dates must be ISO format YYYY-MM-DD.
- min_spend and cap_value are numbers in AED.
- Include evidence quotes (short verbatim snippets) for each field you populate.
- Set flags when appropriate: expired, generic_page, not_an_offer, emi_not_discount, missing_dates, missing_terms.
- confidence is 0-1 for overall extraction quality.
- Return valid JSON only matching the schema.`;
}

function buildUserPrompt(offer, rawText, today) {
    const text = String(rawText || '').slice(0, 4000);
    return `Today's date (Asia/Dubai): ${today}

Offer context:
- source_url: ${offer.sourceUrl || ''}
- bank_name: ${offer.bankName || ''}
- merchant_name: ${offer.merchantName || ''}
- offer_title: ${offer.offerTitle || ''}
- discount_type: ${offer.discountType || ''}
- discount_value: ${offer.discountValue || ''}
- existing valid_to: ${offer.validTo || 'null'}
- existing min_spend: ${offer.minSpend ?? 'null'}
- existing cap_value: ${offer.capValue ?? 'null'}

Page text:
"""
${text}
"""

Return JSON:
{
  "valid_from": "YYYY-MM-DD|null",
  "valid_to": "YYYY-MM-DD|null",
  "min_spend": number|null,
  "cap_value": number|null,
  "card_name": "string|null",
  "coupon_code": "string|null",
  "terms_url": "string|null",
  "flags": ["..."],
  "confidence": 0.0,
  "evidence": [{ "field": "valid_to", "quote": "..." }]
}`;
}

function todayDubai() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date());
}

async function callEnrichmentApi(offer, options) {
    const model = options.model || config.openaiEnrichmentModel;
    const timeout = options.timeout || 15000;
    const client = getClient();
    const userPrompt = buildUserPrompt(offer, offer.rawText, todayDubai());

    const response = await Promise.race([
        client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: buildSystemPrompt() },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            max_tokens: 800,
            response_format: { type: 'json_object' },
        }),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Enrichment request timed out')), timeout),
        ),
    ]);

    const raw = response.choices?.[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return parseOfferEnrichmentResult(JSON.parse(jsonMatch[0]));
}

/**
 * @param {object} offer - Offer with rawText optional
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function enrichOfferWithLlm(offer, options = {}) {
    try {
        return await withRetry(
            () => callEnrichmentApi(offer, options),
            { maxAttempts: options.maxAttempts },
        );
    } catch (err) {
        logger.warn('Offer LLM enrichment failed', {
            offerId: offer.id,
            error: err.message,
        });
        return null;
    }
}

/**
 * Audit/re-check an existing offer (lighter prompt for validity audit pass).
 */
export async function auditOfferWithLlm(offer, options = {}) {
    const result = await enrichOfferWithLlm(offer, options);
    if (!result) return null;

    const auditEntry = {
        at: new Date().toISOString(),
        confidence: result.confidence,
        flags: result.flags,
        valid_to: result.valid_to,
    };

    return { result, auditEntry };
}
