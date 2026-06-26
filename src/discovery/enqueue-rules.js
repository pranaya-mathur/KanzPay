import { shouldFollowLink } from './link-filter.js';

const CAMPAIGN_PATTERNS = [/\/campaigns?\//i, /\/utm_/i, /\/track(?:ing)?\//i];

function isEmptyPathUrl(url) {
    try {
        const { pathname } = new URL(url);
        const trimmed = pathname.replace(/\/$/, '') || '/';
        return trimmed === '/' || /^\/index\.html?$/i.test(trimmed);
    } catch {
        return false;
    }
}

export function shouldEnqueueUrl(url, sourceType, depth = 0) {
    if (CAMPAIGN_PATTERNS.some((p) => p.test(url))) {
        return { enqueue: false, reason: 'campaign_or_tracking' };
    }
    if (isEmptyPathUrl(url)) {
        return { enqueue: false, reason: 'empty_path' };
    }

    const { follow, reason } = shouldFollowLink(url, sourceType);
    if (!follow) return { enqueue: false, reason };

    if (sourceType === 'emiratesNbd' && /\/deals\/deal-search/i.test(url)) {
        return { enqueue: false, reason: 'enbd_search_page' };
    }

    if (sourceType === 'emiratesNbd' && /\/deals\/[^/]+/i.test(url) && !/\/deals\/?$/i.test(url.replace(/\?.*$/, ''))) {
        return { enqueue: true, reason: 'enbd_deal_detail' };
    }

    if (sourceType === 'hsbc' && /\/special-offers\/[^/]+/i.test(url)) {
        return { enqueue: true, reason: 'hsbc_detail_slug' };
    }

    if (sourceType === 'mashreq' && /\/neo\/offers\/[^/]+/i.test(url)) {
        return { enqueue: true, reason: 'mashreq_offer_detail' };
    }

    if (sourceType === 'dib' && /\/offers\/offer-detail\//i.test(url)) {
        return { enqueue: true, reason: 'dib_offer_detail' };
    }

    if (sourceType === 'visaUAE' && !/\/visa-offers-and-perks\//i.test(url) && depth > 0) {
        return { enqueue: false, reason: 'visa_off_topic' };
    }

    if (sourceType === 'fab' && /\/personal\/cards\/credit-cards\/offers\/?$/i.test(url) && depth > 0) {
        return { enqueue: true, reason: 'fab_offers_hub' };
    }

    return { enqueue: true, reason: 'allowed' };
}
