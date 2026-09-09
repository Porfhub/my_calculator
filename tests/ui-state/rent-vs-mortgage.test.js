const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'rent-vs-mortgage.html'), 'utf8');

test('analysis horizon is an always-visible 5–40 year scenario input', () => {
    assert.match(html, /<label for="years-range"[^>]*>Горизонт анализа<\/label>/);
    assert.match(html, /id="years-range" min="5" max="40" step="1" value="20"/);
    assert.match(html, /Number\.isInteger\(state\.years\) && state\.years >= 5 && state\.years <= 40/);
    assert.doesNotMatch(html, /state\.years = 20;/);
});

test('purchase and rent inputs are visible together instead of being hidden behind tabs', () => {
    assert.match(html, /id="purchase-section-title">🏠 Покупка/);
    assert.match(html, /id="rent-section-title">🔑 Аренда/);
    assert.match(html, /id="include-investments"/);
    assert.match(html, /id="investment-rate-field"/);
    assert.doesNotMatch(html, /switchTab|tab-btn-(buy|rent)|tab-content-(buy|rent)/);
});

test('hero result is built from calculated financial values without a decorative scale', () => {
    for (const id of ['verdict-title', 'verdict-difference', 'verdict-period', 'final-buy', 'final-rent', 'comparison-bar-buy', 'comparison-bar-rent']) {
        assert.match(html, new RegExp(`id="${id}"`), id);
    }

    assert.doesNotMatch(html, /scales-beam|scales-pan-left|scales-pan-right|tug-bar/);
    assert.match(html, /document\.getElementById\('verdict-difference'\)\.innerText = formatMoney\(diff\)/);
    assert.match(html, /document\.getElementById\('verdict-period'\)\.innerText = periodLabel/);
});
