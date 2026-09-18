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
    mortgageTermYears: 1,
    analysisYears: 1
};

const approximatelyEqual = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 0.001, `expected ${actual} to equal ${expected}`);

test('analysis horizon is an always-visible 5–40 year scenario input', () => {
    assert.match(html, /<label for="years-range"[^>]*>Горизонт анализа<\/label>/);
    assert.match(html, /id="years-range" min="5" max="40" step="1" value="20"/);
    assert.match(html, /Number\.isInteger\(state\.analysisYears\) && state\.analysisYears >= 5 && state\.analysisYears <= 40/);
    assert.match(html, /Период, через который сравнивается итоговый капитал/);
    assert.match(html, /id="mortgage-term-range" min="5" max="30" step="1" value="20"/);
    assert.match(html, /Number\.isInteger\(state\.mortgageTermYears\) && state\.mortgageTermYears >= 5 && state\.mortgageTermYears <= 30/);
    assert.match(html, /На какой срок рассчитан ежемесячный платёж/);
    assert.match(html, /id="result-mortgage-term"/);
    assert.match(html, /id="result-analysis-years"/);
    assert.match(html, /id="quick-start-assumptions"[^>]*>В быстром старте считаем: жильё \+5% в год, аренда \+4% в год/);
    assert.match(html, /id="dp-range" min="0" max="0\.99"/);
});

test('purchase and rent inputs are visible together instead of being hidden behind tabs', () => {
    assert.match(html, /id="purchase-section-title"/);
    assert.match(html, /id="rent-section-title"/);
    assert.match(html, /🏠 Покупка/);
    assert.match(html, /🔑 Аренда/);
    assert.match(html, /id="include-investments"/);
    assert.match(html, /id="investment-rate-field"/);
    assert.match(html, /id="investment-breakdown" hidden/);
    assert.match(html, /Что инвестируется\?/);
    assert.match(html, /Это сценарий с инвестиционным допущением, а не прогноз доходности/);
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

test('investment breakdown uses current scenario values and is visible only in investment mode', () => {
    const baseline = calculateScenario({ ...baseScenario, includeInvestments: true });
    assert.equal(baseline.initialRenterCapital, 200_000);
    assert.equal(baseline.initialMonthlyDifference, 16_750);
    assert.equal(baseline.annualReturn, 12);

    assert.notEqual(calculateScenario({ ...baseScenario, includeInvestments: true, cost: 1_200_000 }).initialRenterCapital, baseline.initialRenterCapital);
    assert.notEqual(calculateScenario({ ...baseScenario, includeInvestments: true, dpPercent: 0.3 }).initialMonthlyDifference, baseline.initialMonthlyDifference);
    assert.notEqual(calculateScenario({ ...baseScenario, includeInvestments: true, rent: 60_000 }).initialMonthlyDifference, baseline.initialMonthlyDifference);
    assert.notEqual(calculateScenario({ ...baseScenario, includeInvestments: true, rate: 12 }).initialMonthlyDifference, baseline.initialMonthlyDifference);
    assert.notEqual(calculateScenario({ ...baseScenario, includeInvestments: true, investRate: 0 }).monthlyInvestmentRate, baseline.monthlyInvestmentRate);
    assert.notEqual(calculateScenario({ ...baseScenario, includeInvestments: true, analysisYears: 2 }).rentFinal, baseline.rentFinal);

    assert.match(html, /investmentBreakdown\.hidden = !investmentEnabled/);
    assert.match(html, /investment-initial-capital'\)\.innerText = formatMoney\(result\.initialRenterCapital\)/);
    assert.match(html, /investment-monthly-difference'\)\.innerText = `\$\{startingDifference < 0 \? '−' : '\+'\}\$\{formatMoney\(Math\.abs\(startingDifference\)\)\} \/ мес`/);
    assert.match(html, /investment-return-value'\)\.innerText = `\$\{state\.investRate\.toFixed\(1\)\}% в год`/);
    assert.match(html, /Капитал не растёт от доходности/);
    assert.match(html, /<dt[^>]*>Стартовая разница в первый месяц<\/dt>/);
});

const smokeScenario = {
    cost: 10_000_000,
    rate: 16,
    dpPercent: 0.2,
    rent: 50_000,
    investRate: 15,
    growthRE: 5,
    growthRent: 4,
    mortgageTermYears: 20,
    analysisYears: 20,
    includeInvestments: true
};

test('analysis horizon leaves the mortgage payment alone; mortgage term changes it', () => {
    const scenarioA = calculateScenario(smokeScenario);
    const scenarioB = calculateScenario({ ...smokeScenario, analysisYears: 5 });
    const scenarioC = calculateScenario({ ...smokeScenario, mortgageTermYears: 5 });

    approximatelyEqual(scenarioA.mortgagePayment, scenarioB.mortgagePayment);
    assert.ok(scenarioC.mortgagePayment > scenarioA.mortgagePayment);
    assert.ok(scenarioB.remainingMortgageDebt > 0);
    assert.equal(scenarioA.remainingMortgageDebt, 0);
    assert.equal(scenarioC.remainingMortgageDebt, 0);
    for (const scenario of [scenarioA, scenarioB, scenarioC, calculateScenario({ ...smokeScenario, includeInvestments: false })]) {
        for (const value of [scenario.buyFinal, scenario.rentFinal, scenario.mortgagePayment, scenario.remainingMortgageDebt, ...scenario.dataBuy, ...scenario.dataRent]) {
            assert.ok(Number.isFinite(value), `non-finite scenario value: ${value}`);
        }
    }
});

test('buyer capital at a shorter horizon subtracts outstanding mortgage debt', () => {
    const result = calculateScenario({ ...baseScenario, mortgageTermYears: 20, analysisYears: 5, includeInvestments: false });
    approximatelyEqual(result.remainingMortgageDebt, 600_000);
    assert.equal(result.buyFinal, 400_000);
});

test('mortgage payments stop after payoff during a longer analysis horizon', () => {
    const result = calculateScenario({
        ...baseScenario, mortgageTermYears: 5, analysisYears: 20,
        rent: 0, includeInvestments: false
    });
    assert.equal(result.remainingMortgageDebt, 0);
    assert.equal(result.rentFinal, 1_020_000);
    assert.equal(result.buyFinal, 1_000_000);
});
