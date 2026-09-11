const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'rent-vs-mortgage.html'), 'utf8');
const { calculateScenario } = require(path.join(__dirname, '..', '..', 'js', 'rent-vs-mortgage-model.js'));

const baseScenario = {
    cost: 1_000_000,
    rate: 0,
    dpPercent: 0.2,
    rent: 50_000,
    investRate: 12,
    growthRE: 0,
    growthRent: 0,
    years: 1
};

const approximatelyEqual = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 0.001, `expected ${actual} to equal ${expected}`);

test('analysis horizon is an always-visible 5–40 year scenario input', () => {
    assert.match(html, /<label for="years-range"[^>]*>Горизонт анализа<\/label>/);
    assert.match(html, /id="years-range" min="5" max="40" step="1" value="20"/);
    assert.match(html, /Number\.isInteger\(state\.years\) && state\.years >= 5 && state\.years <= 40/);
    assert.doesNotMatch(html, /state\.years = 20;/);
});

test('purchase and rent inputs are visible together instead of being hidden behind tabs', () => {
    assert.match(html, /id="purchase-section-title"/);
    assert.match(html, /id="rent-section-title"/);
    assert.match(html, /🏠 Покупка/);
    assert.match(html, /🔑 Аренда/);
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

test('rent scenario accumulates the down payment and monthly difference without investment income', () => {
    const result = calculateScenario({ ...baseScenario, includeInvestments: false });

    assert.equal(result.initialRenterCapital, 200_000);
    assert.equal(result.monthlyInvestmentRate, 0);
    assert.equal(result.rentFinal, 401_000);
});

test('zero investment return is equivalent to investment income being disabled', () => {
    const withoutIncome = calculateScenario({ ...baseScenario, includeInvestments: false });
    const zeroReturn = calculateScenario({ ...baseScenario, includeInvestments: true, investRate: 0 });

    assert.equal(zeroReturn.monthlyInvestmentRate, 0);
    assert.equal(zeroReturn.rentFinal, withoutIncome.rentFinal);
    assert.match(html, /id="invest-range" min="0"/);
});

test('positive investment return compounds the renter capital monthly', () => {
    const result = calculateScenario({ ...baseScenario, includeInvestments: true });
    const monthlyRate = 0.12 / 12;
    const expected = 200_000 * Math.pow(1 + monthlyRate, 12)
        + 16_750 * ((Math.pow(1 + monthlyRate, 12) - 1) / monthlyRate);

    approximatelyEqual(result.monthlyInvestmentRate, monthlyRate);
    approximatelyEqual(result.rentFinal, Math.round(expected));
    assert.ok(result.rentFinal > calculateScenario({ ...baseScenario, includeInvestments: true, investRate: 0 }).rentFinal);
});

test('a higher rent reduces the renter capital under the same assumptions', () => {
    const lowerRent = calculateScenario({ ...baseScenario, includeInvestments: false });
    const higherRent = calculateScenario({ ...baseScenario, includeInvestments: false, rent: 60_000 });

    assert.ok(higherRent.rentFinal < lowerRent.rentFinal);
});
