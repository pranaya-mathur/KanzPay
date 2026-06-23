export const SOURCE_SELECTORS = {
    emiratesNbd: {
        wait: ['a[href*="/deals/"]', '.deal-info', 'h1'],
        cards: ['a[href*="/deals/"][data-ctatext]', 'a.stretched-link[href*="/deals/"]', 'a[href*="/deals/"]'],
        detail: ['.deal-info', '.deal-details', 'h1'],
        enqueue: 'a[href*="/deals/"]',
    },
    visaUAE: {
        wait: ['.vs-card', '.vs-cards-container', 'h1'],
        cards: ['.vs-card', 'a[href*="/visa-offers-and-perks/"]'],
        detail: ['.vs-card-content', 'h1', 'h2'],
        enqueue: 'a[href*="/visa-offers-and-perks/"]',
    },
    fab: {
        wait: ['h1', 'h2', '.offer', '[class*="offer"]', 'main'],
        cards: ['[class*="offer-card"]', '.promo-card', 'article', 'li'],
        detail: ['h1', '.offer-details', 'main'],
        enqueue: 'a[href*="offer"], a[href*="promo"]',
    },
    adcb: {
        wait: ['.offer-card', '.promo-card', 'article', 'main'],
        cards: ['.offer-card', '.promo-card', 'article', '[class*="offer"]'],
        detail: ['h1', '.offer-details', 'main'],
        enqueue: 'a[href*="offer"], a[href*="promo"]',
    },
    mashreq: {
        wait: ['.offer-card', '.promotion-item', 'article', 'main'],
        cards: ['.offer-card', '.promotion-item', 'article', '[class*="offer"]'],
        detail: ['h1', '.offer-body', 'main'],
        enqueue: 'a[href*="offer"], a[href*="promo"]',
    },
    rakBank: {
        wait: ['.offer-card', '.card-offer', 'article', 'main'],
        cards: ['.offer-card', '.card-offer', 'article'],
        detail: ['h1', 'main'],
        enqueue: 'a[href*="offer"], a[href*="promo"]',
    },
    groupon: {
        wait: ['.deal', '[class*="deal"]', 'main', 'h1'],
        cards: ['.deal', '[class*="deal-card"]', '[data-testid*="deal"]'],
        detail: ['h1', 'main'],
        enqueue: 'a[href*="deal"], a[href*="coupon"]',
    },
    picodi: {
        wait: ['.coupon', '[class*="coupon"]', 'main', 'h1'],
        cards: ['.coupon', '[class*="coupon-item"]', '[class*="offer"]'],
        detail: ['h1', '.coupon-code', 'main'],
        enqueue: 'a[href*="coupon"], a[href*="/ae/"]',
    },
    cuponation: {
        wait: ['.coupon', '.deal', 'main'],
        cards: ['.coupon', '.deal', '[class*="coupon"]'],
        detail: ['h1', 'main'],
        enqueue: 'a[href*="coupon"], a[href*="deal"]',
    },
    generic: {
        wait: ['h1', 'main', 'article'],
        cards: ['article', '.card', '.offer'],
        detail: ['h1', 'main'],
        enqueue: 'a',
    },
};

export function getSelectorsForSource(sourceType) {
    return SOURCE_SELECTORS[sourceType] || SOURCE_SELECTORS.generic;
}

export function primaryWaitSelector(sourceType) {
    const sel = getSelectorsForSource(sourceType);
    return sel.wait.join(', ');
}

export function cardSelectors(sourceType) {
    return getSelectorsForSource(sourceType).cards;
}
