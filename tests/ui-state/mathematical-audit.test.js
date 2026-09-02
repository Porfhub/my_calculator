const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('annual growth assumptions use equivalent monthly compounding', () => {
    const annualRate = 0.12;
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
    assert.ok(Math.abs(Math.pow(1 + monthlyRate, 12) - (1 + annualRate)) < 1e-12);

    const freedom = read('financial-freedom.html');
    const rent = read('rent-vs-mortgage.html');
    assert.match(freedom, /const monthlyInflationRate = Math\.pow\(1 \+ state\.avgInflation, 1 \/ 12\) - 1;/);
    assert.match(rent, /const monthlyGrowthRE = Math\.pow\(1 \+ state\.growthRE \/ 100, 1 \/ 12\) - 1;/);
    assert.match(rent, /const monthlyGrowthRent = Math\.pow\(1 \+ state\.growthRent \/ 100, 1 \/ 12\) - 1;/);
});

test('child-cost projection starts from today\'s prices and covers exactly eighteen years', () => {
    const source = read('genetic-wealth.html');
    assert.match(source, /for \(let y = 0; y < 3; y\+\+\)/);
    assert.match(source, /for \(let y = 3; y < 7; y\+\+\)/);
    assert.match(source, /for \(let y = 7; y < 12; y\+\+\)/);
    assert.match(source, /for \(let y = 12; y < 18; y\+\+\)/);
});

test('calculation displays are not intentionally capped or mislabeled', () => {
    const freedom = read('financial-freedom.html');
    const time = read('time-is-money.html');
    const credit = read('honest-credit.html');
    const mortgage = read('mortgage.html');
    const car = read('car-vs-taxi.html');

    assert.match(freedom, /points\.push\(\{ x: m, y: Math\.round\(balance\) \}\);/);
    assert.doesNotMatch(freedom, /Math\.min\(balance, savings \* 2\)/);
    assert.match(time, /const officialHourlyRate = state\.income \/ monthlyOfficialHours;/);
    assert.match(time, /Ставка без дороги и переработок/);
    assert.match(credit, /Расчётная годовая ставка/);
    assert.match(credit, /while \(getNpv\(high\) < 0 && high < 1e6\)/);
    assert.match(mortgage, /Соотношение тела долга и процентов/);
    assert.match(mortgage, /Итого выплатим:/);
    assert.match(car, /const depositRatePct = Math\.max\(0, cbRate - 2\);/);
    assert.match(car, /tugVerdict = 'Расходы равны';/);
});

test('audit transparency fixes do not derive unsupported or incomparable results', () => {
    const car = read('car-vs-taxi.html');
    const childCost = read('genetic-wealth.html');
    const goal = read('millionaire.html');

    assert.match(car, /Сравнение — по поездкам/);
    assert.doesNotMatch(car, /costPerKmTaxi/);
    assert.doesNotMatch(car, /km-cost-taxi/);

    assert.match(childCost, /без подтверждённой методологии такая разбивка была бы произвольной/);
    assert.doesNotMatch(childCost, /categoryBreakdownChart/);
    assert.doesNotMatch(childCost, /updateCategoryChart/);

    assert.match(goal, /syncAgeFromBirthDate\(\);/);
    assert.match(goal, /if \(input\.key === 'currentAge' && state\.birthDate\)/);
    assert.match(goal, /state\.birthDate = '';/);
});
