const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('critical financial calculators fail closed through the shared state controller', () => {
    for (const file of ['honest-credit.html', 'mortgage.html', 'rent-vs-mortgage.html', 'time-is-money.html']) {
        const html = read(file);
        assert.match(html, /js\/calculator-state\.js/, file);
        assert.match(html, /CalculatorState\.STATES\.(INVALID_INPUT|CALCULATION_IMPOSSIBLE)/, file);
    }
});

test('mortgage never replaces a user payment or down payment behind their back', () => {
    const html = read('mortgage.html');
    assert.doesNotMatch(html, /state\.downPayment\s*=\s*state\.cost/);
    assert.doesNotMatch(html, /state\.termYears\s*=\s*Math\.min\(/);
    assert.doesNotMatch(html, /currentPmt\s*=\s*Math\.ceil\(balance \* mRate\) \+ 1000/);
    assert.match(html, /Первоначальный взнос должен быть меньше стоимости недвижимости/);
    assert.match(html, /не покрывает ежемесячные проценты/);
    assert.doesNotMatch(html, />КПД</);
});

test('honest credit and price of time reject invalid values before rendering conclusions', () => {
    const credit = read('honest-credit.html');
    const time = read('time-is-money.html');
    assert.match(credit, /initialInflow <= 0/);
    assert.match(credit, /totalAir < 0/);
    assert.match(time, /state\.income > 0/);
    assert.match(time, /state\.hours > 0/);
    assert.match(time, /timeStateController\.transition\(CalculatorState\.STATES\.INVALID_INPUT/);
});

test('rent versus mortgage explains an invalid calculation without hiding a negative cash position', () => {
    const html = read('rent-vs-mortgage.html');
    assert.match(html, /state\.dpPercent < 1/);
    assert.match(html, /state\.growthRE >= -50/);
    assert.match(html, /!Number\.isFinite\(buyFinal\) \|\| !Number\.isFinite\(rentFinal\)/);
    assert.match(html, /Отрицательное значение: расходы аренды/);
    assert.doesNotMatch(html, /При этих рыночных предположениях нельзя построить корректное сравнение/);
    assert.match(html, /rentStateController\.transition\(CalculatorState\.STATES\.CALCULATION_IMPOSSIBLE/);
});
