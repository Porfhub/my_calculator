const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const api = require('../../js/api.js');
const { validateFreshness } = require('../../data_validation/validate.js');
const inflationFixture = require('../data-validation/fixtures/inflation.json');
const ratesFixture = require('../data-validation/fixtures/financial-goal-rates.json');

const html = readFileSync(path.join(__dirname, '../../millionaire.html'), 'utf8');
const context = { window: {}, ...api };
vm.runInNewContext(html.match(/<script id="goal-model">([\s\S]+?)<\/script>/)[1], context);
const model = context.window.FinancialGoal;
const base = { savings: 100_000, contribution: 20_000, goal: 500_000, rate: 0, mode: 'fixed' };
const compute = options => model.calculate({ ...base, ...options });
const close = (actual, expected, tolerance = 0.000001) => assert.ok(
    Math.abs(actual - expected) < tolerance, actual + ' ≠ ' + expected
);

// Independent ordering check via the closed form for end-of-month deposits.
function capitalAt({ savings, contribution, rate }, months) {
    if (rate === 0) return savings + contribution * months;
    const monthly = rate / 1200;
    const compoundGain = Math.expm1(months * Math.log1p(monthly));
    return savings * (1 + compoundGain) + contribution * compoundGain / monthly;
}

function verify(options, months, cents) {
    const input = { ...base, ...options };
    const result = model.calculate(input);
    assert.equal(result.status, months === 0 ? 'already' : 'reached');
    assert.equal(result.months, months);
    assert.equal(result.history.at(-1).month, months);
    close(result.finalBalance, capitalAt(input, months));
    if (cents !== undefined) assert.equal(Math.round(result.finalBalance * 100), cents);
    close(result.totalInvested, input.savings + result.contributions);
    close(result.totalInvested + result.totalInterest, result.finalBalance);
    if (months > 0) {
        const previous = result.history.at(-2);
        assert.ok(previous.balance < previous.target);
    }
    return result;
}

test('A–D: linear savings, zero starting capital, already reached, and no growth', () => {
    const linear = verify({}, 20, 50_000_000);
    assert.equal(linear.totalInvested, 500_000);
    assert.equal(linear.totalInterest, 0);
    verify({ savings: 0, contribution: 10_000, goal: 120_000 }, 12, 12_000_000);
    const already = verify({ savings: 1_000_000 }, 0, 100_000_000);
    assert.equal(already.target, 500_000);
    assert.equal(already.history.length, 1);
    assert.equal(compute({ contribution: 0 }).status, 'no-growth');
});

test('E: inflation changes only the indexed threshold and real values', () => {
    verify({ inflation: 0 }, 20);
    verify({ inflation: 0, mode: 'today' }, 20);
    const fixed = verify({ inflation: 0.12 }, 20);
    close(fixed.realTarget, 413_942.4507215484);
    const indexed = verify({ inflation: 0.12, mode: 'today' }, 28, 66_000_000);
    close(indexed.target, 651_346.4601362026);
    close(indexed.realTarget, 500_000);
    assert.ok(indexed.realBalance > indexed.realTarget);
    verify({ savings: 90, contribution: 0, goal: 100, inflation: -0.12, mode: 'today' }, 10);
});

test('F: nominal monthly accrual and interest-only growth', () => {
    verify({ rate: 5 }, 19, 50_281_281);
    verify({ rate: 10 }, 18, 50_278_082);
    verify({ contribution: 0, rate: 5 }, 388);
    verify({ contribution: 0, rate: 10 }, 194);
});

test('return illustration accrues on existing capital before each new contribution', () => {
    const result = verify({ savings: 100_000, contribution: 20_000, goal: 142_210, rate: 12 }, 2);
    assert.equal(result.history[1].balance, 121_000);
    assert.equal(result.history[2].balance, 142_210);
});

test('G: inclusive horizon, a one-kopeck shortfall, small and fractional goals, large target', () => {
    const horizon = { savings: 0, contribution: 100 };
    verify({ ...horizon, goal: 119_900 }, 1199);
    verify({ ...horizon, goal: 120_000 }, 1200);
    verify({ ...horizon, contribution: 0.01, goal: 12 }, 1200);
    assert.equal(compute({ ...horizon, goal: 120_100 }).status, 'horizon');
    assert.equal(compute({ ...horizon, goal: 120_000.01 }).status, 'horizon');
    verify({ savings: 100.25, contribution: 50.50, goal: 201.25 }, 2, 20_125);
    verify({ savings: 0, contribution: 5, goal: 50 }, 10);
    verify({ savings: 0, contribution: 0.01, goal: 0.01 }, 1);
    verify({ savings: 100_000, contribution: 80_000, goal: 100_000_000, rate: 14 }, 236, 10_060_782_779);
    assert.equal(compute({ contribution: 0, rate: 5, inflation: 0.12, mode: 'today' }).status, 'horizon');
    const compounding = { savings: 30_000_000, contribution: 0, rate: 0.1 };
    const final = Math.floor(capitalAt(compounding, 1200) * 100) / 100;
    verify({ ...compounding, goal: final }, 1200);
    assert.equal(compute({ ...compounding, goal: final + 0.01 }).status, 'horizon');
});

test('start example and audit reproduction distinguish overshoot from the target', () => {
    const input = { contribution: 80_000, goal: 1_000_000 };
    verify(input, 12, 106_000_000);
    const fixed = verify({ ...input, rate: 14, inflation: 0.07048063 }, 11, 104_678_138);
    close(fixed.realBalance, fixed.finalBalance / Math.pow(1.07048063, 11 / 12));
    close(fixed.realTarget, 1_000_000 / Math.pow(1.07048063, 11 / 12));
    assert.equal(Math.round(fixed.realBalance), 983_427);
    assert.equal(Math.round(fixed.realTarget), 939_477);
    const indexed = verify({ ...input, rate: 14, inflation: 0.07048063, mode: 'today' }, 12);
    close(indexed.target, 1_070_480.63);
});

test('money parsing preserves decimals, signs, blanks, grouping and range', () => {
    const parse = (raw, min = 0) => model.parseDecimal(raw, 2, model.MAX_MONEY, min);
    for (const input of ['100,25', '100.25']) assert.equal(parse(input).value, 100.25);
    assert.equal(parse('1 234\u00a0567\u202f890,25').error, 'range');
    assert.equal(parse('1 234\u00a0567,25').value, 1_234_567.25);
    assert.equal(parse('100 000 000,00').value, 100_000_000);
    assert.equal(parse('100 000 000,01').error, 'range');
    assert.equal(parse('9 007 199 254 740 993').error, 'range');
    assert.equal(parse('−1000').error, 'negative');
    assert.equal(parse('-1000').error, 'negative');
    assert.equal(parse('').error, 'empty');
    assert.equal(parse('0', 0.01).error, 'range');
    assert.equal(parse('0,00').value, 0);
    for (const input of ['12oops3', '1e3', '1,2 3', '1,234', '12.', '1\t200']) assert.equal(parse(input).error, 'format', input);
    assert.equal(model.groupMoney('1234567.'), '1\u00a0234\u00a0567,');
    assert.equal(model.groupMoney('9 007 199 254 740 993').replace(/\s/g, ''), '9007199254740993');
    assert.equal(model.parseDecimal('12,1234', 4, model.MAX_RATE).value, 12.1234);
    assert.equal(model.parseDecimal('', 4, model.MAX_RATE).error, 'empty');
    assert.equal(model.parseDecimal('30,0001', 4, model.MAX_RATE).error, 'range');
});

test('key rate follows the published soft/hard TTL and checks provenance and shape', () => {
    const rate = {
        ...ratesFixture, fetched_at: '2026-11-03T09:00:00Z',
        metadata: { ...ratesFixture.metadata, last_successful_fetch_at: '2026-11-03T09:00:00Z' }
    };
    for (const [stamp, status, expected] of [
        ['2026-11-03T09:00:00Z', 'ok', 'ok'],
        ['2026-11-06T09:00:00Z', 'ok', 'ok'],
        ['2026-11-06T09:00:00.001Z', 'ok', undefined],
        ['2026-11-10T09:00:00Z', 'stale', 'stale'],
        ['2026-11-10T09:00:00.001Z', 'stale', undefined]
    ]) {
        const now = new Date(stamp);
        const dataset = { ...rate, status, metadata: { ...rate.metadata, status } };
        assert.equal(model.rateReference(dataset, now)?.status, expected);
        if (expected) assert.doesNotThrow(() => validateFreshness('rates', dataset, now));
        else assert.throws(() => validateFreshness('rates', dataset, now));
    }
    const now = new Date('2026-11-03T12:00:00Z');
    assert.equal(model.rateReference({ ...rate, key_rate: { value_percent: null } }, now), null);
    assert.equal(model.rateReference({ ...rate, cb_rate: 13 }, now), null);
    assert.equal(model.rateReference({ ...rate, metadata: { ...rate.metadata, source_url: 'https://example.test' } }, now), null);
    assert.equal(model.rateReference(null, now), null);
});

test('inflation freshness follows annual publication and the stale grace window', () => {
    const stale = { ...inflationFixture, metadata: { ...inflationFixture.metadata, status: 'stale' } };
    const now = new Date('2026-11-03T12:00:00Z');
    const history = model.inflationReference(inflationFixture, now);
    assert.equal(history.first, 2011);
    assert.equal(history.last, 2025);
    close(history.value, 0.07048063, 0.00000001);
    for (const [stamp, dataset, expected] of [
        ['2027-01-31T23:59:59.999Z', inflationFixture, 'ok'],
        ['2027-02-01T00:00:00Z', inflationFixture, undefined],
        ['2027-02-01T00:00:00Z', stale, 'stale'],
        ['2027-05-01T23:59:59.999Z', stale, 'stale'],
        ['2027-05-02T00:00:00Z', stale, undefined]
    ]) {
        const date = new Date(stamp);
        assert.equal(model.inflationReference(dataset, date)?.status, expected);
        if (expected) assert.doesNotThrow(() => validateFreshness('inflation', dataset, date));
        else assert.throws(() => validateFreshness('inflation', dataset, date));
    }
    assert.equal(model.inflationReference({ ...inflationFixture, annual: [] }, now), null);
    assert.equal(model.inflationReference(null, now), null);
});

test('private values, local field errors and analytics boundaries are explicit', () => {
    for (const id of ['goal-sum', 'current-savings', 'monthly-contribution', 'budget-income', 'budget-expenses', 'annual-return']) {
        const control = html.match(new RegExp('<input[^>]+id="' + id + '"[^>]*>'))[0];
        assert.match(control, /ym-disable-keys/);
        assert.match(control, /inputmode="decimal"/);
        assert.match(control, new RegExp('aria-describedby="' + id + '-error(?: |")'));
        assert.ok(html.includes('<label for="' + id + '">'));
    }
    assert.match(html, /goal-stack ym-hide-content/);
    assert.match(html, /stage.className = 'ym-hide-content'/);
    assert.match(html, /stage.dataset.screenshotStage/);
    assert.match(html, /rel="canonical" href="https:\/\/yasnomera.ru\/millionaire.html"/);
    assert.doesNotMatch(html, /birth-date|current-age|mobile-sticky|type="range"|URLSearchParams/);
    assert.equal((html.match(/reachGoal\('share_click'\)/g) || []).length, 1);
    assert.equal((html.match(/reachGoal\('calculate_success'\)/g) || []).length, 1);
    assert.match(html, /type: 'linear'/);
});
