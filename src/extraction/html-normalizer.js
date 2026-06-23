import * as cheerio from 'cheerio';

export function loadHtml(html) {
    if (!html) return cheerio.load('');
    return cheerio.load(html);
}

export function stripBoilerplate($) {
    if (!$) return $;
    $('script, style, noscript, nav, footer, header, .cookie, #cookie, .breadcrumb').remove();
    return $;
}
