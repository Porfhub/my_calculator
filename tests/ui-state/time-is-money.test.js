const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'time-is-money.html'), 'utf8');
const modelSource = html.slice(
    html.indexOf('// TIME_MODEL_START'),
    html.indexOf('// TIME_MODEL_END')
);
const context = {};
vm.runInNewContext(`${modelSource}; this.model = { calculateTimeCost, isValidTimeModelInput, WEEKS_IN_MONTH };`, context);
const { calculateTimeCost, isValidTimeModelInput, WEEKS_IN_MONTH } = context.model;
const base = { purchase: 150000, income: 100000, hours: 8, workDays: 5, commuteMinutes: 60, overtime: 0 };
const close = (actual, expected, tolerance = 0.06) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

test('remote, hybrid and office scenarios follow the approved 52/12 model', () => {
    const remote = calculateTimeCost({ ...base, officeDays: 0 });
    close(remote.monthlyOfficialHours, 173.333);
    close(remote.monthlyCommuteHours, 0);
    close(remote.effectiveHourlyRate, 576.923);
    close(remote.purchaseHours, 260);
    close(remote.scheduledWorkDays, 32.5);

    const hybrid = calculateTimeCost({ ...base, officeDays: 3 });
    close(hybrid.monthlyCommuteHours, 26);
    close(hybrid.totalWorkRelatedHours, 199.333);
    close(hybrid.effectiveHourlyRate, 501.672);
    close(hybrid.purchaseHours, 299);
    close(hybrid.scheduledWorkDays, 37.375);

    const office = calculateTimeCost({ ...base, officeDays: 5 });
    close(office.monthlyCommuteHours, 43.333);
    close(office.totalWorkRelatedHours, 216.667);
    close(office.effectiveHourlyRate, 461.538);
    close(office.purchaseHours, 325);
    close(office.scheduledWorkDays, 40.625);
});

test('commute is counted both ways only on office days and workdays use scheduled hours', () => {
    const result = calculateTimeCost({ ...base, hours: 10, workDays: 4, officeDays: 2, commuteMinutes: 45 });
    close(result.monthlyCommuteHours, 2 * 0.75 * 2 * WEEKS_IN_MONTH);
    close(result.scheduledWorkDays, result.purchaseHours / 10);
});

test('fractional work schedule can commute on all 3.5 average workdays', () => {
    const result = calculateTimeCost({ ...base, workDays: 3.5, officeDays: 3.5 });
    close(result.monthlyOfficialHours, 8 * 3.5 * WEEKS_IN_MONTH);
    close(result.monthlyCommuteHours, 2 * 1 * 3.5 * WEEKS_IN_MONTH);
    close(result.totalWorkRelatedHours, (8 * 3.5 + 2 * 1 * 3.5) * WEEKS_IN_MONTH);
    assert.equal(isValidTimeModelInput({ ...base, workDays: 3.5, officeDays: 3.5 }), true);
});

test('fractional schedules, large prices and invalid states are handled explicitly', () => {
    const fractional = calculateTimeCost({ ...base, workDays: 3.5, officeDays: 3 });
    close(fractional.monthlyOfficialHours, 8 * 3.5 * WEEKS_IN_MONTH);
    assert.ok(calculateTimeCost({ ...base, purchase: 5000000, officeDays: 0 }).purchaseHours > 0);
    for (const invalid of [
        { ...base, purchase: 0, officeDays: 0 },
        { ...base, purchase: NaN, officeDays: 0 },
        { ...base, income: 0, officeDays: 0 },
        { ...base, income: NaN, officeDays: 0 },
        { ...base, workDays: 3.5, officeDays: 4 },
        { ...base, hours: 0, officeDays: 0 }
    ]) {
        assert.equal(isValidTimeModelInput(invalid), false);
        assert.equal(calculateTimeCost(invalid), null);
    }
});

test('page contract keeps conditional commute, clamping, URL state, neutral copy and PNG export', () => {
    assert.match(html, /wrapper\.hidden=remote;input\.disabled=remote/);
    assert.match(html, /state\.officeDays=Math\.min\(state\.officeDays,state\.workDays\)/);
    assert.match(html, /if\(state\.workDays===5&&Number\.isInteger\(state\.officeDays\)\)/);
    assert.match(html, /input\.id='office-days-input'.*input\.max=String\(state\.workDays\).*input\.step='0\.5'/);
    assert.match(html, /history\.replaceState/);
    assert.match(html, /takeScreenshot\('results-card', 'yasnomera-time-is-money\.png'\)/);
    assert.match(html, /data-screenshot-fallback/);
    assert.match(html, /Это приблизительный перевод цены в рабочее время, а не оценка покупки/);
    assert.doesNotMatch(html, /Критический уровень|Отрезвляющий итог|Как купить это быстрее|mobile-sticky-results/);
});

test('calculate_success is tied to a valid user-initiated outcome and fires once', () => {
    assert.match(html, /outcome\.ok&&options\.userInitiated&&hasUserEdited&&!calculateSuccessTracked/);
    assert.match(html, /update\(\{userInitiated:false\}\)/);
    assert.match(html, /calculateSuccessTracked=true/);
});

test('money inputs group Russian thousands without changing numeric state', () => {
    assert.match(html, /id="purchase-input" type="text" inputmode="numeric"/);
    assert.match(html, /id="income-input" type="text" inputmode="numeric"/);
    assert.match(html, /new Intl\.NumberFormat\('ru-RU',\{maximumFractionDigits:0,useGrouping:true\}\)/);
    assert.match(html, /replace\(\/\[\\s\\u00a0\\u202f\]\/g,''\)/);
    assert.doesNotMatch(html, /onfocus="unformatMoneyInput/);
    assert.match(html, /onblur="formatMoneyInput\('income',this\)"/);
    assert.match(html, /purchase-input'\)\.value=groupedInteger\(state\.purchase\)/);
    assert.match(html, /income-input'\)\.value=groupedInteger\(state\.income\)/);
});
