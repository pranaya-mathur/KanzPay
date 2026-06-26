import { cleanText } from '../../shared/utils/text-normalize.js';
import { isDiscoverySourced, getHostnameFromOffer } from './source-mapper.service.js';
import { canIngestFromSource } from '../sources/source-policy.service.js';

export const DISCOVERY_AUTO_CONFIDENCE = 0.65;

const KNOWN_PARSERS = new Set([
    'enbdParser', 'emiratesNbdParser', 'visaParser', 'visaUaeParser',
    'fabParser', 'adcbParser', 'mashreqParser', 'dibParser', 'adibParser',
    'rakbankParser', 'hsbcParser', 'cbdParser', 'bankOfferParser',
    'couponFeedParser', 'merchantParser',
]);

const REGISTRY_SOURCE_TYPES = new Set([
    'emiratesNbd', 'adcb', 'mashreq', 'fab', 'dib', 'adib',
    'rakBank', 'hsbc', 'cbd', 'visaUAE', 'couponFeed', 'merchant',
]);

/**
 * Hybrid discovery routing before standard confidence/gate checks.
 * @returns {{ action: 'continue'|'quarantine'|'reject', quarantineType?: string, reasons: string[], discoveryAutoAccepted?: boolean }}
 */
export function evaluateDiscoveryPolicy(normalized, registrySource, discoveryIndex = new Map(), context = {}) {
    const reasons = [];
    const discoverySourced = isDiscoverySourced(normalized, discoveryIndex);
    const hostname = getHostnameFromOffer(normalized);

    if (registrySource) {
        if (!canIngestFromSource(registrySource)) {
            return {
                action: 'quarantine',
                quarantineType: 'rejected_source',
                reasons: ['rejected_source', registrySource.rejectionReason || registrySource.status],
            };
        }
        return { action: 'continue', reasons: [] };
    }

    if (REGISTRY_SOURCE_TYPES.has(normalized.sourceType) && !discoverySourced) {
        return { action: 'continue', reasons: [] };
    }

    if (!discoverySourced && normalized.sourceType === 'generic') {
        return {
            action: 'quarantine',
            quarantineType: 'discovery_review',
            reasons: ['unknown_generic_source'],
        };
    }

    const confidence = context.confidence ?? normalized.confidence ?? 0;
    const strong = hasStrongDiscoverySignals(normalized, confidence);

    if (strong) {
        return {
            action: 'continue',
            reasons: [],
            discoveryAutoAccepted: true,
        };
    }

    return {
        action: 'quarantine',
        quarantineType: 'discovery_review',
        reasons: reasons.length ? reasons : ['weak_discovery_signals', hostname || 'unknown_host'],
    };
}

function hasStrongDiscoverySignals(offer, confidence) {
    const merchant = cleanText(offer.merchantName);
    const hasMerchant = merchant && merchant.length >= 2;
    const hasDiscount = offer.discountValue != null && String(offer.discountValue).length > 0;
    const hasDiscountType = !!cleanText(offer.discountType);
    const knownParser = KNOWN_PARSERS.has(offer.parserName);

    return confidence >= DISCOVERY_AUTO_CONFIDENCE
        && hasMerchant
        && (hasDiscount || hasDiscountType)
        && knownParser;
}
