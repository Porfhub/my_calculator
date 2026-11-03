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

const bootstrap = html.match(/<script id="time-url-bootstrap">([\s\S]+?)<\/script>/)[1];
const application = html.match(/<script>\s*(\/\/ TIME_MODEL_START[\s\S]+?)<\/script>/)[1];

function loadPage(query = '', { referrer = '', clipboard, denyHistory = false } = {}) {
    const location = new URL('https://yasnomera.ru/time-is-money.html' + query);
    const historyCalls = [];
    const goals = [];
    const nodes = new Map();
    const element = (id, dataset = {}) => {
        const events = {};
        const node = {
            dataset, value: '', textContent: '', hidden: false, attrs: {},
            classList: { add() {}, toggle() {} },
            setAttribute(name, value) { this.attrs[name] = value; },
            addEventListener(name, fn) { events[name] = fn; },
            fire(name) { return events[name]({ currentTarget: this }); },
            showModal() { this.open = true; },
            focus() {}, select() { this.selected = true; }
        };
        nodes.set(id, node);
        return node;
    };
    for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"([^>]*)>/g)) {
        const [, id, attributes] = match;
        const field = attributes.match(/data-time-field="([^"]+)"/);
        const node = element(id, field ? { timeField: field[1] } : {});
        node.hidden = /\bhidden\b/.test(attributes);
    }
    const buttons = Array.from({ length: 6 }, (_, i) => element('office-' + i, { officeDays: String(i) }));
    const inputs = [...nodes.values()].filter(node => node.dataset.timeField);
    const env = {
        URL, location, window: {}, navigator: { clipboard },
        history: { state: { retained: true }, replaceState(state, title, href) {
            if (denyHistory) throw new Error('history unavailable');
            historyCalls.push({ state, href });
            location.href = href;
        } },
        document: {
            referrer, body: element('body'),
            getElementById: id => nodes.get(id),
            querySelectorAll: selector => selector === '[data-time-field]' ? inputs : buttons
        },
        reachGoal: name => goals.push(name),
        showToast: message => { env.toast = message; }
    };
    vm.createContext(env);
    const stateScript = fs.readFileSync(path.join(root, 'js/calculator-state.js'), 'utf8');
    vm.runInContext(bootstrap + stateScript + ';const CalculatorState = window.CalculatorState;\n' + application +
        '\nthis.page = {state, cleanTimeUrl, timeUrlIsClean, timeAnalyticsReferrer, shareTimeScenario, parseInputNumber, decimalInput};', env);
    return {
        ...env.page, nodes, goals, location, historyCalls, env,
        edit(id, value) {
            nodes.get(id).value = value;
            nodes.get(id).fire('input');
        }
    };
}

test('exact fractional result and both decimal separators preserve the model', () => {
    const fractional = { ...base, hours: 7.5, workDays: 3.5, officeDays: 2.5, overtime: 1.5 };
    close(calculateTimeCost(fractional).purchaseHours, 212.875, 1e-10);
    for (const separator of [',', '.']) {
        const page = loadPage();
        page.edit('hours-input', '7' + separator + '5');
        page.edit('work-days-input', '3' + separator + '5');
        page.edit('office-days-input', '2' + separator + '5');
        page.edit('overtime-input', '1' + separator + '5');
        assert.equal(page.nodes.get('hours-input').value, '7' + separator + '5');
        assert.equal(page.nodes.get('purchase-hours').textContent, '213');
        assert.match(page.nodes.get('scheduled-days-result').textContent, /28,4 рабочего дня по 7,5 часа/);
        assert.equal(page.nodes.get('export-overtime').textContent, '1,5 ч/нед.');
        assert.match(page.nodes.get('overtime-impact').textContent, /6,5 ч в месяц/);
    }
});

test('initial URL is captured before resources, scrubbed once and retains attribution', () => {
    const page = loadPage('?price=150000&income=100000&hours=7.5&days=3.5&office=2.5&commute=60&unpaid=1.5&utm_source=qa&extra=a&extra=b#fragment',
        { referrer: 'https://yasnomera.ru/time-is-money.html?price=42&income=87&utm_source=previous' });
    assert.equal(page.nodes.get('purchase-hours').textContent, '213');
    assert.equal(page.nodes.get('scenario-badge').textContent, 'По ссылке');
    assert.equal(page.nodes.get('scenario-badge').hidden, false);
    assert.equal(page.location.search, '?utm_source=qa&extra=a&extra=b');
    assert.equal(page.location.hash, '#fragment');
    assert.deepEqual(page.historyCalls, [{ state: { retained: true }, href: page.location.href }]);
    assert.equal(page.timeAnalyticsReferrer(), 'https://yasnomera.ru/time-is-money.html?utm_source=previous');
    assert.deepEqual(page.goals, []);
    page.edit('purchase-input', '170000');
    assert.equal(page.historyCalls.length, 1);
    assert.deepEqual(page.goals, ['calculate_success']);
    assert.ok(html.indexOf('id="time-url-bootstrap"') < html.indexOf('<link'));
    assert.match(html, /if \(timeUrlIsClean\) \{[\s\S]*?referrer:timeAnalyticsReferrer\(\),url:cleanTimeUrl\.href/);
    const denied = loadPage('?price=150000', { denyHistory: true });
    assert.equal(denied.timeUrlIsClean, false);
    assert.equal(denied.nodes.get('purchase-hours').textContent, '299');
});

test('UTM-only visits and valid edits never write a scenario to the current URL', () => {
    const page = loadPage('?utm_source=qa&yclid=synthetic');
    assert.equal(page.nodes.get('scenario-badge').textContent, 'По примеру');
    page.edit('income-input', '100 000');
    assert.deepEqual(page.goals, []);
    page.edit('income-input', '90\u202f000');
    page.nodes.get('income-input').fire('blur');
    assert.equal(page.nodes.get('income-input').value, '90\u00a0000');
    page.edit('purchase-input', '170000');
    assert.equal(page.nodes.get('scenario-badge').hidden, true);
    assert.equal(page.location.search, '?utm_source=qa&yclid=synthetic');
    assert.deepEqual(page.historyCalls, []);
    assert.deepEqual(page.goals, ['calculate_success']);
});

test('invalid input clears the previous calculation and shows field-specific errors', async () => {
    const page = loadPage();
    for (const [id, input, error, expected] of [
        ['income-input', '', 'income-error', /доход больше 0/],
        ['income-input', '0', 'income-error', /доход больше 0/],
        ['income-input', '-1', 'income-error', /доход больше 0/],
        ['purchase-input', '1e3', 'purchase-error', /цену покупки больше 0/],
        ['purchase-input', '9007199254740992', 'purchase-error', /выше допустимого максимума/],
        ['hours-input', '0', 'hours-error', /не более 24/],
        ['hours-input', '7,', 'hours-error', /не более 24/],
        ['work-days-input', '2,5', 'officeDays-error', /до 2,5/],
        ['commute-input', '1441', 'commuteMinutes-error', /1 440/],
        ['overtime-input', '-1', 'overtime-error', /до 168/]
    ]) {
        const old = page.nodes.get(id).value;
        const goalsBefore = page.goals.length;
        page.edit(id, input);
        assert.equal(page.nodes.get(id).value, input);
        assert.match(page.nodes.get(error).textContent, expected);
        assert.equal(page.nodes.get(error).hidden, false);
        assert.equal(page.nodes.get('time-answer').hidden, true);
        assert.equal(page.nodes.get('purchase-hours').textContent, '—');
        assert.equal(page.nodes.get('save-time-png').disabled, true);
        assert.equal(page.nodes.get('share-time').disabled, true);
        await page.shareTimeScenario();
        assert.equal(page.goals.length, goalsBefore);
        assert.equal(page.state.officeDays, 3);
        page.edit(id, old);
        assert.equal(page.nodes.get('save-time-png').disabled, false);
        assert.equal(page.nodes.get('share-time').disabled, false);
    }
    assert.deepEqual(page.goals, ['calculate_success']);
});

test('share serialises only the READY scenario and offers manual copy on rejection or absence', async () => {
    for (const clipboard of [undefined, { writeText: async () => { throw new Error('denied'); } }]) {
        const page = loadPage('?utm_medium=qa', { clipboard });
        page.nodes.get('office-0').fire('click');
        await page.shareTimeScenario();
        const link = new URL(page.nodes.get('time-share-url').value);
        assert.equal(link.searchParams.get('office'), '0');
        assert.equal(link.searchParams.has('commute'), false);
        assert.equal(link.searchParams.has('utm_medium'), false);
        assert.equal(page.location.search, '?utm_medium=qa');
        assert.equal(page.nodes.get('commute-field').hidden, true);
        assert.equal(page.nodes.get('time-share-dialog').open, true);
        assert.equal(page.nodes.get('time-share-url').selected, true);
        assert.equal(page.env.toast, undefined);
        assert.equal(loadPage(link.search).nodes.get('purchase-hours').textContent, '260');
    }
});

test('successful clipboard copy exports the shown state and deduplicates conversion', async () => {
    let copied;
    const page = loadPage('', { clipboard: { writeText: async value => { copied = value; } } });
    page.edit('hours-input', '7,5');
    page.edit('work-days-input', '3,5');
    page.edit('office-days-input', '2,5');
    page.edit('overtime-input', '1,5');
    await page.shareTimeScenario();
    const restored = loadPage(new URL(copied).search);
    assert.equal(restored.nodes.get('purchase-hours').textContent, '213');
    assert.equal(restored.state.overtime, 1.5);
    assert.equal(page.location.search, '');
    assert.equal(page.env.toast, 'Ссылка скопирована');
    assert.deepEqual(page.goals, ['calculate_success', 'share_click']);
    assert.deepEqual(restored.goals, []);
});
