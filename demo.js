import * as cheerio from 'cheerio';
import { routeParser } from './src/parsers/index.js';
import { normalizeOffer, passesQualityGate } from './src/schema/offerSchema.js';

const url = 'https://www.emiratesnbd.com/en/deals/good-times/ferrari-world-yas-island';

async function runDemo() {
    console.log(`Fetching live URL: ${url}`);
    
    // add headers to simulate browser
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`Fetched ${html.length} bytes of HTML.`);

    const $ = cheerio.load(html);
    const rawText = $('body').text();
    
    console.log(`Parsing HTML with KanzPay parsers...`);
    const { parserId, offers } = routeParser(url, $, rawText, html, {
        sourceTypeHint: 'emiratesNbd',
    });

    console.log(`Parser selected: ${parserId}`);
    console.log(`Offers found before quality check: ${offers.length}`);

    const validOffers = offers
        .map((o) => normalizeOffer(o))
        .filter((o) => passesQualityGate(o, { pageLength: rawText.length, rawText }));

    console.log(`\nValid Offers passing Quality Gates: ${validOffers.length}`);
    
    if (validOffers.length > 0) {
        console.log(JSON.stringify(validOffers, null, 2));
    }
}

runDemo().catch(console.error);
