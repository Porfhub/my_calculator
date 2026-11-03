const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../../honest-credit.html'), 'utf8');
const source = html.match(/<script id="credit-model">([\s\S]*?)<\/script>/)[1];
const model = vm.runInNewContext(source + '\n({ CREDIT_DEFAULTS, CREDIT_FIELDS, parseCreditField, calculateCreditScenario, creditScenarioRate, creditSharePayload, readCreditShare })');
const defaults = model.CREDIT_DEFAULTS;
const calculate = overrides => model.calculateCreditScenario({ ...defaults, ...overrides });
const near = (actual, expected, tolerance = .01) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≉ ${expected}`);

// Independent oracle. Build a discount-factor ledger month by month and solve the
// cash-flow equation against the explicit series, without the production annuity factor.
function reference(input) {
    const { amount, term, rate, insurance, financed, fee, services } = input;
    function discountedMonths(monthlyRate) {
        let sum = 0;
        let discount = 1;
        for (let month = 1; month <= term; month++) {
            discount /= 1 + monthlyRate;
            sum += discount;
        }
        return sum;
    }
    const debt = amount + (financed ? insurance : 0);
    const payment = debt / discountedMonths(rate / 1200);
    const monthly = payment + services;
    const upfront = fee + (financed ? 0 : insurance);
    const inflow = amount - upfront;
    const total = monthly * term + upfront;
    let lower = 0;
    let upper = 1;
    while (monthly * discountedMonths(upper) > inflow) upper *= 2;
    for (let step = 0; step < 100; step++) {
        const midpoint = (lower + upper) / 2;
        if (monthly * discountedMonths(midpoint) > inflow) lower = midpoint;
        else upper = midpoint;
    }
    const interest = payment * term - debt;
    const insuranceInterest = financed ? insurance * (term / discountedMonths(rate / 1200) - 1) : 0;
    return { debt, payment, monthly, upfront, total, extra: total - amount, interest, insuranceInterest,
        serviceTotal: services * term, annualRate: (lower + upper) / 2 * 1200 };
}

const scenarios = [
    ['A', {}, { payment: 16822.90, total: 605624.51, extra: 105624.51, annualRate: 12.900 }],
    ['B', { insurance: 50000, financed: true }, { debt: 550000, payment: 18505.19, total: 666186.96,
        extra: 166186.96, annualRate: 19.699, interest: 116186.96, insuranceInterest: 10562.45, upfront: 0 }],
    ['C', { insurance: 50000 }, { debt: 500000, payment: 16822.90, total: 655624.51, upfront: 50000,
        extra: 155624.51, annualRate: 20.432, insuranceInterest: 0 }],
    ['D', { fee: 20000, services: 599 }, { payment: 16822.90, monthly: 17421.90, upfront: 20000,
        total: 647188.51, extra: 147188.51, annualRate: 18.285, serviceTotal: 21564 }],
    ['E', { fee: 0, services: 0, insurance: 0 }, { total: 605624.51, extra: 105624.51, annualRate: 12.900 }]
];

function checkAgainstReference(input, result) {
    for (const [key, value] of Object.entries(reference(input))) {
        near(result[key], value, key === 'annualRate' ? .001 : .01);
    }
    near(input.amount + result.interest + input.insurance + input.fee + result.serviceTotal, result.total);
    assert.ok(result.insuranceInterest <= result.interest);
}

for (const [label, overrides, expected] of scenarios) {
    test(`credit scenario ${label} agrees with the audit and independent cash-flow ledger`, () => {
        const input = { ...defaults, ...overrides };
        const { state, result } = calculate(overrides);
        assert.equal(state, 'READY');
        for (const [key, value] of Object.entries(expected)) {
            assert.equal(Number(result[key].toFixed(key === 'annualRate' ? 3 : 2)), value);
        }
        checkAgainstReference(input, result);
    });
}

test('funded insurance costs exactly its interest more than separate insurance', () => {
    const financed = calculate(scenarios[1][1]).result;
    const separate = calculate(scenarios[2][1]).result;
    near(financed.total - separate.total, financed.insuranceInterest);
    near(financed.total - separate.total, 10562.45);
    assert.equal(calculate(scenarios[3][1]).result.serviceTotal + scenarios[3][1].fee, 41564);
    assert.deepEqual(calculate({ ...scenarios[3][1], ...scenarios[4][1] }), calculate({}));
});

test('zero and tiny rates, fractional amounts and both term boundaries stay finite', () => {
    for (const overrides of [
        { rate: 0 }, { rate: 0, term: 1 }, { rate: 0, term: 120 }, { rate: .00000001 },
        { rate: .00001, services: .01 }, { amount: .01, term: 120, rate: 0, insurance: .01, financed: true },
        { amount: 10000000, term: 120, rate: 50, insurance: 1000000, financed: true, fee: 500000, services: 20000 },
        { amount: 500000.50, term: 1, rate: 12.9, fee: 25.17, services: 599.03, insurance: 15.55 }
    ]) {
        const { state, result } = calculate(overrides);
        assert.equal(state, 'READY');
        checkAgainstReference({ ...defaults, ...overrides }, result);
    }
    assert.equal(calculate({ rate: 0 }).result.annualRate, 0);
    assert.equal(calculate({ rate: 0 }).result.total, 500000);
    near(calculate({ rate: 0 }).result.payment, 13888.89);
});

test('upfront costs are subtracted in cents and the rate solver is not capped', () => {
    for (const input of [{ amount: 100, fee: 101 }, { amount: .3, fee: .1, insurance: .2 }, { amount: 100, fee: 100 }]) {
        const { state, reason } = calculate(input);
        assert.equal(state, 'CALCULATION_IMPOSSIBLE');
        assert.equal(reason, 'inflow');
    }
    const overrides = { amount: 500000, fee: 499999.99, rate: 50, term: 1, services: 20000 };
    const { state, result } = calculate(overrides);
    assert.equal(state, 'READY');
    near(result.annualRate / ((result.monthly / .01 - 1) * 1200), 1, 1e-12);
    assert.ok(Number.isNaN(model.creditScenarioRate(Number.MIN_VALUE, 1, 1)));
});

test('input parsers distinguish empty, zero, decimals, grouping, limits and malformed strings', () => {
    const { CREDIT_FIELDS: fields, parseCreditField: parse } = model;
    for (const text of ['500000,50', '500000.50', '500 000,50', '500\u00a0000,50', '500\u202f000.50']) {
        assert.equal(parse(text, fields.amount), 500000.50);
    }
    for (const text of ['0', '0,0', '0.0']) assert.equal(parse(text, fields.rate), 0);
    for (const text of ['12.9', '12,9']) assert.equal(parse(text, fields.rate), 12.9);
    for (const text of ['', ' ', '-500000', '500000,555', '500o00', '500,0.5', '5e5', '50\t000']) {
        assert.ok(Number.isNaN(parse(text, fields.amount)), text);
    }
    for (const key of ['amount', 'term', 'rate']) assert.ok(Number.isNaN(parse('', fields[key])));
    for (const overrides of [
        { amount: 0 }, { amount: -.01 }, { amount: .001 }, { amount: 10000000.01 }, { term: 0 },
        { term: 1.1 }, { term: 121 }, { rate: -1 }, { rate: 50.01 }, { insurance: 1000000.01 },
        { fee: 500000.01 }, { services: 20000.01 }, { services: -.01 }, { rate: NaN }
    ]) assert.equal(calculate(overrides).state, 'INVALID_INPUT');
});

test('share payload round-trips all conditions and fails closed on invalid or incompatible payloads', () => {
    const input = { amount: 500000.50, term: 36, rate: 12.95, insurance: 50000.04, financed: true, fee: .01, services: 599.99 };
    const payload = model.creditSharePayload(input);
    const restored = model.readCreditShare(JSON.parse(JSON.stringify(payload)));
    assert.deepEqual({ ...restored }, input);
    assert.deepEqual(model.calculateCreditScenario(restored), model.calculateCreditScenario(input));
    for (const invalid of [null, [], payload.slice(0, -1), [2, ...payload.slice(1)], [1, '500000', ...payload.slice(2)],
        [1, 500000.555, ...payload.slice(2)], [1, 500000, 36, 12.9, 50000, 'true', 0, 0]]) {
        assert.equal(model.readCreditShare(invalid), null);
    }
});
