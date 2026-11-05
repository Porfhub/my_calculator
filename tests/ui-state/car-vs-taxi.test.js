const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('car-vs-taxi.html');
const script = html.match(/<script>\s*(const state = \{[\s\S]*?)<\/script>/)[1];
const goalsScript = html.match(/<script>\s*((?:\(function\(\) \{\s*let tracked = false;)[\s\S]*?)<\/script>/)[1];

function node() {
    const attributes = new Map();
    return {
        value: '',
        innerText: '',
        textContent: '',
        style: {},
        classList: { add() {}, remove() {} },
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => attributes.delete(name),
        getAttribute: (name) => attributes.get(name),
        setSelectionRange() {}
    };
}

function page(dataResponse) {
    const nodes = new Map();
    const listeners = new Map();
    const requests = [];
    const goals = [];
    const element = (id) => {
        if (!nodes.has(id)) nodes.set(id, node());
        return nodes.get(id);
    };
    const env = vm.createContext({
        document: {
            getElementById: element,
            querySelectorAll: () => [],
            addEventListener: (type, listener) => listeners.set(type, listener),
            removeEventListener: (type) => listeners.delete(type)
        },
        window: {},
        fetch: (...args) => {
            requests.push(args);
            return dataResponse?.();
        },
        reachGoal: (...args) => goals.push(args),
        initTheme() {}, showToast() {}, shareLink() {}
    });
    vm.runInContext(read('js/utils.js') + script + goalsScript, env);
    const run = (code) => vm.runInContext(code, env);
    run('window.onload()');
    return {
        run, element, requests, goals,
        change(type, id) { listeners.get(type)?.({ target: { id } }); },
        rate(value) {
            element('opportunity-rate').value = value;
            run('calculate()');
        }
    };
}

const rubles = (text) => Number(text.replace(/[^\d]/g, ''));
const baseIds = [
    'grid-car-annual', 'grid-taxi-annual', 'grid-car-monthly', 'grid-taxi-monthly',
    'monthly-diff', 'verdict-title', 'verdict-description', 'tug-of-war-verdict',
    'tug-car-pct', 'tug-taxi-pct', 'tug-car-bar', 'tug-taxi-bar', 'km-cost-main',
    'mobile-verdict-title', 'mobile-monthly-diff', 'mobile-car-total', 'mobile-taxi-total'
];
const baseSnapshot = ({ element }) => baseIds.map((id) => [element(id).innerText, element(id).style.width]);

test('car/taxi starts from the base annual benchmark and a blank scenario', () => {
    const { element } = page();
    assert.equal(rubles(element('grid-car-annual').innerText), 418748);
    assert.equal(rubles(element('grid-taxi-annual').innerText), 180000);
    assert.equal(rubles(element('annual-mileage-display').innerText), 3600);
    assert.equal(element('opportunity-rate').value, '');
    assert.equal(element('opportunity-result').hidden, true);
    assert.equal(element('opportunity-rate-error').textContent, '');
});

for (const [input, amount] of [
    ['0', 0], ['0,00', 0], ['12', 312000], ['12.34', 320840], ['12,34', 320840],
    ['.5', 13000], [',01', 260], ['100', 2600000], ['100.00', 2600000]
]) {
    test(`car/taxi accepts ${input}% in the isolated scenario`, () => {
        const app = page();
        const before = baseSnapshot(app);
        app.rate(input);
        assert.equal(app.element('opportunity-rate').getAttribute('aria-invalid'), undefined);
        assert.equal(app.element('opportunity-result').hidden, false);
        assert.equal(rubles(app.element('opportunity-income').textContent), amount);
        assert.equal(rubles(app.element('opportunity-car-annual').textContent), 418748 + amount);
        assert.equal(rubles(app.element('opportunity-comparison').textContent), 238748 + amount);
        assert.equal(app.element('opportunity-winner-change').textContent, '');
        assert.deepEqual(baseSnapshot(app), before);
    });
}

for (const input of ['-1', '+12', '100.01', '99999999999999999999', '12,345', '12.3.4', '12%', '1e2', 'NaN', '1 2', '12,']) {
    test(`car/taxi rejects ${input}% and clears a previous scenario`, () => {
        const app = page();
        app.rate('12');
        app.rate(input);
        assert.equal(app.element('opportunity-rate').getAttribute('aria-invalid'), 'true');
        assert.match(app.element('opportunity-rate-error').textContent, /от 0 до 100/);
        assert.equal(app.element('opportunity-result').hidden, true);
        assert.equal(app.element('opportunity-income').textContent, '');
        assert.equal(app.element('opportunity-car-annual').textContent, '');
        assert.equal(app.element('opportunity-comparison').textContent, '');

        app.rate('');
        assert.equal(app.element('opportunity-result').hidden, true);
        assert.equal(app.element('opportunity-rate').getAttribute('aria-invalid'), undefined);
        assert.equal(app.element('opportunity-rate-error').textContent, '');
    });
}

test('car/taxi recalculates the retained scenario after the price changes with the disclosure closed', () => {
    const app = page();
    app.rate('12');
    app.element('capital-scenario').open = false;
    app.element('car-price').value = '3000000';
    app.run("handleInput(document.getElementById('car-price'), 'carPrice')");
    app.element('capital-scenario').open = true;
    assert.equal(app.element('opportunity-rate').value, '12');
    assert.equal(rubles(app.element('grid-car-annual').innerText), 462748);
    assert.equal(rubles(app.element('opportunity-income').textContent), 360000);
    assert.equal(rubles(app.element('opportunity-car-annual').textContent), 822748);
});

test('car/taxi compares the scenario separately when the base winner is the car', () => {
    const app = page();
    app.run("handleRawInput('tripsPerMonth', '30'); handleRawInput('tripPrice', '1500')");
    const before = baseSnapshot(app);
    assert.equal(app.element('verdict-title').innerText, 'Машина выгоднее');
    app.rate('0');
    assert.match(app.element('opportunity-comparison').textContent, /^Авто дешевле/);
    app.rate('12');
    assert.match(app.element('opportunity-comparison').textContent, /^Такси дешевле/);
    assert.equal(rubles(app.element('opportunity-comparison').textContent), 190748);
    assert.match(app.element('opportunity-winner-change').textContent, /Сравнение изменилось/);
    assert.deepEqual(baseSnapshot(app), before);
});

test('car/taxi scenario handles equal expenses', () => {
    const app = page();
    app.run("handleRawInput('tripsPerMonth', '0'); handleRawInput('insurance', '0'); handleRawInput('maintenance', '0'); handleRawInput('depreciation', '0')");
    app.rate('0');
    assert.equal(app.element('opportunity-comparison').textContent, 'Стоимость авто и такси за первый год одинакова.');
    assert.equal(app.element('opportunity-winner-change').textContent, '');
    app.rate('12');
    assert.match(app.element('opportunity-comparison').textContent, /^Такси дешевле/);
    assert.match(app.element('opportunity-winner-change').textContent, /Сравнение изменилось/);
    assert.equal(app.element('verdict-title').innerText, 'Расходы равны');
});

test('car/taxi results require no rates request in any dataset or network state', () => {
    assert.doesNotMatch(html, /js\/api\.js|rates\.json|fetchRates|cbRate/);
    for (const respond of [
        ...['ok', 'stale', 'unavailable'].map(status => () => ({ ok: true, json: async () => ({ status }) })),
        () => { throw new Error('offline'); }
    ]) {
        const app = page(respond);
        app.rate('12');
        assert.deepEqual(app.requests, []);
        assert.equal(rubles(app.element('grid-car-annual').innerText), 418748);
        assert.equal(rubles(app.element('grid-taxi-annual').innerText), 180000);
        assert.equal(rubles(app.element('opportunity-car-annual').textContent), 730748);
    }
});

test('car/taxi keeps the legacy goal on existing inputs without tracking the new rate', () => {
    const app = page();
    app.change('input', 'opportunity-rate');
    app.change('change', 'opportunity-rate');
    assert.deepEqual(app.goals, []);
    app.change('input', 'car-price');
    app.change('change', 'trips-per-month');
    assert.deepEqual(app.goals, [['calculate_success']]);
});
