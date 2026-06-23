-- Migration 006: Additional UAE loyalty, retail, and bank sources
-- Safe to run multiple times — ON CONFLICT (domain, source_type) DO NOTHING

BEGIN;

INSERT INTO sources (
    source_name, domain, base_url, source_type, category, status, priority,
    parser_profile_json, crawl_rules_json, created_at, updated_at
) VALUES

('ADIB Offers',
 'adib.ae',
 'https://www.adib.ae/en/personal/cards/credit-cards/offers',
 'adib', 'bank', 'probation', 68,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":2,"waitSelector":".offer, .promotion, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Standard Chartered UAE Offers',
 'sc.com',
 'https://www.sc.com/ae/credit-cards/promotions/',
 'scb', 'bank', 'probation', 62,
 '{"parserName":"bankOfferParser","crawlerMode":"playwright","maxDepth":2,"waitSelector":".offer-card, .promo, article","confidenceFloor":0.45,"strictQualityGate":true}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Shukran (Landmark Rewards)',
 'shukran.com',
 'https://www.shukran.com/ae/en/offers',
 'shukran', 'loyalty', 'probation', 52,
 '{"parserName":"couponFeedParser","crawlerMode":"playwright","maxDepth":2,"waitSelector":".offer, .deal, main","confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Blue Rewards (Al Futtaim)',
 'bluerewards.ae',
 'https://www.bluerewards.ae/en/offers',
 'blueRewards', 'loyalty', 'probation', 50,
 '{"parserName":"couponFeedParser","crawlerMode":"playwright","maxDepth":2,"waitSelector":".offer, .promotion, main","confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":1500}',
 NOW(), NOW()),

('Talabat Offers',
 'talabat.com',
 'https://www.talabat.com/uae/offers',
 'talabat', 'merchant', 'probation', 48,
 '{"parserName":"couponFeedParser","crawlerMode":"playwright","maxDepth":2,"waitSelector":".offer, [class*=\"deal\"], main","confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":2000}',
 NOW(), NOW()),

('Namshi Deals',
 'namshi.com',
 'https://www.namshi.com/uae-en/deals/',
 'namshi', 'merchant', 'probation', 46,
 '{"parserName":"couponFeedParser","crawlerMode":"playwright","maxDepth":2,"waitSelector":".deal, [class*=\"offer\"], main","confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":2000}',
 NOW(), NOW()),

('Amazon.ae Deals',
 'amazon.ae',
 'https://www.amazon.ae/gp/goldbox',
 'amazonAe', 'merchant', 'probation', 44,
 '{"parserName":"couponFeedParser","crawlerMode":"playwright","maxDepth":2,"waitSelector":".deal, [class*=\"Deal\"], main","confidenceFloor":0.4}',
 '{"respectRobotsTxt":true,"requestDelay":2000}',
 NOW(), NOW())

ON CONFLICT (domain, source_type) DO NOTHING;

COMMIT;
