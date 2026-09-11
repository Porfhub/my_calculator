const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pages = [
    ['index.html', 'https://yasnomera.ru/'],
    ['mortgage.html', 'https://yasnomera.ru/mortgage.html'],
    ['wealth.html', 'https://yasnomera.ru/wealth.html'],
    ['rent-vs-mortgage.html', 'https://yasnomera.ru/rent-vs-mortgage.html'],
    ['time-is-money.html', 'https://yasnomera.ru/time-is-money.html'],
    ['inflation-shredder.html', 'https://yasnomera.ru/inflation-shredder.html'],
    ['car-vs-taxi.html', 'https://yasnomera.ru/car-vs-taxi.html'],
    ['millionaire.html', 'https://yasnomera.ru/millionaire.html'],
    ['financial-freedom.html', 'https://yasnomera.ru/financial-freedom.html'],
    ['honest-credit.html', 'https://yasnomera.ru/honest-credit.html'],
    ['genetic-wealth.html', 'https://yasnomera.ru/genetic-wealth.html']
];

test('every public page uses the production brand and complete discovery metadata', () => {
    for (const [file, canonical] of pages) {
        const html = read(file);
        const body = html.slice(html.indexOf('<body'));
        assert.match(html, /<title>[^<]*Ясномера[^<]*<\/title>/, file);
        assert.match(body, /Ясномера/, file);
        assert.match(html, /<meta name="description" content="[^"]+">/, file);
        assert.match(html, new RegExp(`<link rel="canonical" href="${escapeRegExp(canonical)}">`), file);
        assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/, file);
        assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="yasnomera-mark\.svg">/, file);
        assert.doesNotMatch(html, /favicon\.ico/, file);
        assert.match(html, /<meta property="og:site_name" content="Ясномера">/, file);
        assert.match(html, /<meta property="og:title" content="[^"]*Ясномера[^"]*">/, file);
        assert.match(html, /<meta name="twitter:title" content="[^"]*Ясномера[^"]*">/, file);
        const structuredData = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
        assert.ok(structuredData, file);
        assert.doesNotThrow(() => JSON.parse(structuredData[1]), file);
        assert.doesNotMatch(html, /CalcHub|Финансовый Хаб|My Calculator|my calculator|my_calculator/i, file);
    }
});

test('PWA and crawler files use the production identity and domain', () => {
    const manifest = JSON.parse(read('manifest.webmanifest'));
    assert.equal(manifest.short_name, 'Ясномера');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.icons[0].src, '/yasnomera-mark.svg');
    assert.equal(manifest.icons[0].type, 'image/svg+xml');
    assert.match(read('yasnomera-mark.svg'), /<title[^>]*>Ясномера<\/title>/);
    assert.match(read('robots.txt'), /Sitemap: https:\/\/yasnomera\.ru\/sitemap\.xml/);
    const sitemap = read('sitemap.xml');
    for (const [, canonical] of pages) assert.match(sitemap, new RegExp(escapeRegExp(canonical)));
});

test('exports and application cache carry the Yasnomera identity', () => {
    assert.match(read('js/ui-utils.js'), /yasnomera-calculation\.png/);
    assert.match(read('sw.js'), /yasnomera-cache-v15/);
    assert.match(read('sw.js'), /'\/manifest\.webmanifest'/);
    assert.match(read('sw.js'), /'\/yasnomera-mark\.svg'/);
    for (const [file] of pages.slice(1)) {
        const html = read(file);
        if (html.includes('takeScreenshot(')) assert.doesNotMatch(html, /takeScreenshot\([^\n]*,\s*'(?!yasnomera-)[^']+\.png'/, file);
    }
});
