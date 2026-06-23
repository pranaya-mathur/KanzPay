-- Migration 005: Seed additional UAE bank, coupon, and loyalty sources
-- Safe to run multiple times — ON CONFLICT (domain, source_type) DO NOTHING

BEGIN;

INSERT INTO sources (
    source_name, domain, base_url, source_type, category, status, priority,
    parser_profile_json, crawl_rules_json, created_at, updated_at
) VALUES

-- ── New UAE banks ─────────────────────────────────────────────────────────────

('ADCB Offers',
 'adcb.com',
 'https://www.adcb.com/en/personal/credit-cards/offers.aspx',
 'adcb', 'bank', 'approved', 95,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":1,"waitSelector":".offer-card, .promo-card, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Mashreq Offers',
 'mashreq.com',
 'https://www.mashreq.com/en/uae/personal/offers/',
 'mashreq', 'bank', 'approved', 90,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":1,"waitSelector":".offer-card, .promotion-item, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('RAK Bank Offers',
 'rakbank.ae',
 'https://www.rakbank.ae/wps/portal/retail-banking/credit-cards/offers',
 'rakBank', 'bank', 'probation', 75,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":1,"waitSelector":".offer-card, .card-offer, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Dubai Islamic Bank Offers',
 'dib.ae',
 'https://www.dib.ae/personal/cards/credit-cards/offers',
 'dib', 'bank', 'probation', 70,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":1,"waitSelector":".offer, .promotion, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('HSBC UAE Offers',
 'hsbc.ae',
 'https://www.hsbc.ae/credit-cards/offers/',
 'hsbc', 'bank', 'probation', 70,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":1,"waitSelector":".offer-card, .promo-card, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Citibank UAE Promotions',
 'citibank.ae',
 'https://www.citibank.ae/en/personal/promotions/',
 'citibank', 'bank', 'probation', 65,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":1,"waitSelector":".offer-card, .promo-item, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('CBD Credit Card Offers',
 'cbd.ae',
 'https://www.cbd.ae/personal/cards/credit-cards/offers/',
 'cbd', 'bank', 'probation', 60,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":1,"waitSelector":".offer-card, .deal-card, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Mastercard UAE Promotions',
 'mastercard.ae',
 'https://www.mastercard.ae/en-ae/consumers/find-card-products/promotions.html',
 'mastercard', 'network', 'probation', 75,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":1,"waitSelector":".promotion-card, .offer-card, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

-- ── Coupon aggregators ────────────────────────────────────────────────────────

('Groupon UAE',
 'groupon.ae',
 'https://www.groupon.ae/',
 'groupon', 'coupon', 'probation', 55,
 '{"parserName":"couponFeedParser","crawlerMode":"cheerio","maxDepth":1,"confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1000}',
 NOW(), NOW()),

('Cuponation UAE',
 'cuponation.ae',
 'https://www.cuponation.ae/',
 'cuponation', 'coupon', 'probation', 50,
 '{"parserName":"couponFeedParser","crawlerMode":"cheerio","maxDepth":1,"confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1000}',
 NOW(), NOW()),

('Picodi UAE',
 'picodi.com',
 'https://www.picodi.com/ae/',
 'picodi', 'coupon', 'probation', 48,
 '{"parserName":"couponFeedParser","crawlerMode":"cheerio","maxDepth":1,"confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1000}',
 NOW(), NOW()),

('Coupons.ae',
 'coupons.ae',
 'https://www.coupons.ae/',
 'couponsAe', 'coupon', 'probation', 48,
 '{"parserName":"couponFeedParser","crawlerMode":"cheerio","maxDepth":1,"confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1000}',
 NOW(), NOW()),

('Wethrift UAE',
 'wethrift.com',
 'https://www.wethrift.com/ae',
 'wethrift', 'coupon', 'probation', 45,
 '{"parserName":"couponFeedParser","crawlerMode":"cheerio","maxDepth":1,"confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1000}',
 NOW(), NOW()),

-- ── Loyalty & deal platforms ──────────────────────────────────────────────────

('Smiles (ENOC Rewards)',
 'smiles.ae',
 'https://www.smiles.ae/en/offers',
 'smiles', 'coupon', 'probation', 55,
 '{"parserName":"couponFeedParser","crawlerMode":"playwright","maxDepth":1,"confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Noon Deals & Offers',
 'noon.com',
 'https://www.noon.com/uae-en/offers/',
 'noon', 'merchant', 'probation', 50,
 '{"parserName":"couponFeedParser","crawlerMode":"playwright","maxDepth":1,"confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW())

ON CONFLICT (domain, source_type) DO NOTHING;

COMMIT;
