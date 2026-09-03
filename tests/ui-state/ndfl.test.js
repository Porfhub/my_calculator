const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const ndfl = require(path.join(root, 'js', 'ndfl.js'));
const wealth = fs.readFileSync(path.join(root, 'wealth.html'), 'utf8');

test('standard employment NDFL uses every current progressive annual bracket', () => {
    assert.equal(ndfl.taxFromAnnualGross(2400000), 312000);
    assert.equal(ndfl.taxFromAnnualGross(5000000), 702000);
    assert.equal(ndfl.taxFromAnnualGross(20000000), 3402000);
    assert.equal(ndfl.taxFromAnnualGross(50000000), 9402000);
    assert.equal(ndfl.taxFromAnnualGross(60000000), 11602000);
});

test('take-home to accrued conversion is the inverse of the standard progressive calculation', () => {
    for (const annualGross of [1200000, 2400000, 3000000, 5000000, 12000000, 20000000, 35000000, 50000000, 75000000]) {
        const annualNet = annualGross - ndfl.taxFromAnnualGross(annualGross);
        assert.ok(Math.abs(ndfl.annualGrossFromAnnualNet(annualNet) - annualGross) < 0.000001);
    }
    assert.equal(ndfl.monthlyGrossFromMonthlyNet(87000), 100000);
});

test('income comparison defaults to take-home entry and discloses its standard NDFL conversion', () => {
    assert.match(wealth, /name="salaryMode" value="net" checked/);
    assert.match(wealth, /Зарплата «на руки»/);
    assert.match(wealth, /Начисленная зарплата до НДФЛ/);
    assert.match(wealth, /фактически получаете после удержания НДФЛ/);
    assert.match(wealth, /Росстат публикует зарплаты в таком формате/);
    assert.match(wealth, /Ndfl\.monthlyGrossFromMonthlyNet/);
    assert.match(wealth, /Индивидуальные льготы и особые налоговые ситуации не учитываются/);
});
