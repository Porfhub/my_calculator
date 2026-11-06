const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('car-vs-taxi.html');
const script = html.match(/<script>\s*(const byId = [\s\S]*?)<\/script>/)[1];

function page(dataResponse) {
    const nodes = new Map();
    const requests = [];
    const goals = [];
    const element = (id) => {
        if (!nodes.has(id)) {
            const attributes = new Map();
            const input = html.match(new RegExp('<input[^>]*\\bid="' + id + '"[^>]*>'))?.[0] || '';
            const caption = html.match(new RegExp('<span id="' + id + '">([^<]*)</span>'))?.[1] ?? '';
            nodes.set(id, {
                value: input.match(/\bvalue="([^"]*)"/)?.[1] ?? '',
                type: input.match(/\btype="([^"]*)"/)?.[1],
                textContent: caption,
                style: {},
                setAttribute: (name, value) => attributes.set(name, String(value)),
                removeAttribute: (name) => attributes.delete(name),
                getAttribute: (name) => attributes.get(name),
                setSelectionRange(start, end, direction) {
                    Object.assign(this, { selectionStart: start, selectionEnd: end, selectionDirection: direction });
                },
                addEventListener() {}
            });
            if (id === 'verdict-title') {
                Object.defineProperty(nodes.get(id), 'textContent', {
                    get: () => ['verdict-phrase', 'verdict-join', 'verdict-prefix', 'verdict-amount', 'verdict-unit']
                        .map(part => element(part).textContent).join('')
                });
            }
        }
        return nodes.get(id);
    };
    const env = vm.createContext({
        document: { getElementById: element, addEventListener() {} },
        window: {}, navigator: {},
        IntersectionObserver: class { observe() {} },
        fetch: (...args) => {
            requests.push(args);
            return dataResponse?.();
        },
        reachGoal: (...args) => goals.push(args)
    });
    vm.runInContext(read('js/utils.js') + script, env);
    const run = (code) => vm.runInContext(code, env);
    return {
        run, element, requests, goals,
        period(value) {
            run('period = ' + JSON.stringify(value) + '; renderResult()');
        },
        edit(id, value, { trusted = true, inputType = 'insertText' } = {}) {
            const target = element(id);
            Object.assign(target, { value, id, selectionStart: value.length, selectionEnd: value.length });
            env.editEvent = { target, isTrusted: trusted, inputType };
            run('onBaseInput(editEvent)');
        },
        rate(value) {
            element('opportunity-rate').value = value;
            run('renderCapitalScenario()');
        }
    };
}

const rubles = (text) => Number(text.replace(/[^\d]/g, ''));
const baseIds = [
    'car-total', 'taxi-total', 'car-cash', 'car-loss', 'car-fuel', 'car-fixed', 'car-other',
    'verdict-title', 'verdict-detail', 'result-reason', 'car-bar', 'taxi-bar',
    'comparison-scale', 'car-per-km', 'mobile-verdict-title', 'mobile-difference'
];
const baseSnapshot = ({ element }) => baseIds.map((id) => [element(id).textContent, element(id).style.width]);

test('car/taxi starts from the base annual benchmark and a blank scenario', () => {
    const app = page();
    const { element } = app;
    assert.equal(element('verdict-title').textContent, 'Такси дешевле на 19 896 ₽/мес.');
    assert.equal(rubles(element('car-total').textContent), 34896);
    assert.equal(rubles(element('taxi-total').textContent), 15000);
    app.period('year');
    assert.equal(rubles(element('car-total').textContent), 418748);
    assert.equal(rubles(element('taxi-total').textContent), 180000);
    assert.match(element('annual-mileage-display').textContent, /= 3\s600 км в год$/);
    assert.equal(element('opportunity-rate').value, '');
    assert.equal(element('opportunity-result').hidden, true);
    assert.equal(element('opportunity-rate-error').textContent, '');
});

for (const [input, amount] of [
    ['0', 0], ['0,00', 0], ['10', 260000], ['12', 312000], ['14', 364000], ['12.34', 320840], ['12,34', 320840],
    ['.5', 13000], [',01', 260], ['100', 2600000], ['100.00', 2600000]
]) {
    test(`car/taxi accepts ${input}% in the isolated scenario`, () => {
        const app = page();
        const before = baseSnapshot(app);
        app.rate(input);
        assert.equal(app.element('opportunity-rate').getAttribute('aria-invalid'), undefined);
        assert.equal(app.element('opportunity-result').hidden, false);
        assert.equal(rubles(app.element('opportunity-income').textContent), amount);
        assert.equal(rubles(app.element('opportunity-difference').textContent), 238748 + amount);
        assert.match(app.element('opportunity-comparison').textContent, /^При таком предположении такси выгоднее/);
        assert.equal(app.element('opportunity-comparison-note').textContent.startsWith('При 0%'), amount === 0);
        assert.deepEqual(baseSnapshot(app), before);
    });
}

test('car/taxi explains the 10% benchmark as baseline difference plus possible income', () => {
    const app = page();
    app.rate('10');
    assert.equal(app.element('opportunity-basis').textContent, 'при 10 % от 2 600 000 ₽');
    assert.equal(app.element('opportunity-income').textContent, '260 000 ₽');
    assert.equal(app.element('opportunity-comparison').textContent, 'При таком предположении такси выгоднее');
    assert.equal(app.element('opportunity-difference').textContent, 'на 498 748 ₽');
    assert.equal(app.element('opportunity-comparison-note').textContent, '238 748 ₽ — разница без доходности. +260 000 ₽ — предполагаемый доход.');
    assert.doesNotMatch(html, /id="opportunity-(?:base|car-annual)"/);
    assert.deepEqual(app.goals, []);
});

for (const input of ['-1', '+12', '100.01', '99999999999999999999', '12,345', '12.3.4', '12%', '1e2', 'NaN', '1 2', '12,']) {
    test(`car/taxi rejects ${input}% and clears a previous scenario`, () => {
        const app = page();
        app.rate('12');
        app.rate(input);
        assert.equal(app.element('opportunity-rate').getAttribute('aria-invalid'), 'true');
        assert.match(app.element('opportunity-rate-error').textContent, /от 0 до 100/);
        assert.equal(app.element('opportunity-result').hidden, true);
        for (const id of ['income', 'basis', 'comparison', 'difference', 'comparison-note']) {
            assert.equal(app.element(`opportunity-${id}`).textContent, '');
        }

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
    app.edit('car-price', '3000000');
    app.period('year');
    app.element('capital-scenario').open = true;
    assert.equal(app.element('opportunity-rate').value, '12');
    assert.equal(rubles(app.element('car-total').textContent), 462748);
    assert.equal(rubles(app.element('opportunity-income').textContent), 360000);
    assert.equal(rubles(app.element('opportunity-difference').textContent), 642748);
});

test('car/taxi compares the scenario separately when the base winner is the car', () => {
    const app = page();
    app.edit('trip-price', '1500');
    const before = baseSnapshot(app);
    assert.match(app.element('verdict-title').textContent, /^Машина дешевле/);
    app.rate('0');
    assert.match(app.element('opportunity-comparison').textContent, /^При таком предположении машина выгоднее/);
    assert.match(app.element('opportunity-comparison-note').textContent, /совпадает с основным сравнением/);
    app.rate('1');
    assert.match(app.element('opportunity-comparison').textContent, /^При таком предположении машина выгоднее/);
    assert.equal(rubles(app.element('opportunity-difference').textContent), 95252);
    app.rate('12');
    assert.match(app.element('opportunity-comparison').textContent, /^При таком предположении такси выгоднее/);
    assert.equal(rubles(app.element('opportunity-difference').textContent), 190748);
    assert.equal(app.element('opportunity-comparison-note').textContent, 'Без доходности машина выгоднее на 121 252 ₽. Предполагаемый доход 312 000 ₽ сдвигает разницу в пользу такси.');
    assert.deepEqual(baseSnapshot(app), before);
});

test('car/taxi scenario handles equal expenses', () => {
    const app = page();
    for (const id of ['trips-per-month', 'insurance', 'maintenance', 'depreciation-range']) app.edit(id, '0');
    app.rate('0');
    assert.equal(app.element('opportunity-comparison').textContent, 'При таком предположении машина и такси равны по затратам');
    assert.equal(app.element('opportunity-difference').textContent, 'Разница 0 ₽');
    assert.match(app.element('opportunity-comparison-note').textContent, /совпадает с основным сравнением/);
    app.rate('12');
    assert.match(app.element('opportunity-comparison').textContent, /^При таком предположении такси выгоднее/);
    assert.match(app.element('opportunity-comparison-note').textContent, /^0\s₽ — разница без доходности/);
    assert.equal(app.element('verdict-title').textContent, 'Расходы равны');
});

test('car/taxi shows an exact scenario tie at a positive rate without declaring a winner', () => {
    const app = page();
    for (const id of ['insurance', 'maintenance', 'depreciation-range', 'fuel-consumption']) app.edit(id, '0');
    app.edit('trips-per-month', '1');
    app.edit('trip-price', '1000');
    app.edit('car-price', '100000');
    app.rate('12');
    assert.equal(rubles(app.element('opportunity-income').textContent), 12000);
    assert.equal(app.element('opportunity-comparison').textContent, 'При таком предположении машина и такси равны по затратам');
    assert.equal(app.element('opportunity-difference').textContent, 'Разница 0 ₽');
    assert.match(app.element('verdict-title').textContent, /^Машина дешевле/);
});

test('car/taxi results require no rates request in any dataset or network state', () => {
    assert.doesNotMatch(html, /js\/api\.js|rates\.json|fetchRates|cbRate/);
    for (const respond of [
        ...['ok', 'stale', 'unavailable'].map(status => () => ({ ok: true, json: async () => ({ status }) })),
        () => { throw new Error('offline'); }
    ]) {
        const app = page(respond);
        app.period('year');
        app.rate('12');
        assert.deepEqual(app.requests, []);
        assert.equal(rubles(app.element('car-total').textContent), 418748);
        assert.equal(rubles(app.element('taxi-total').textContent), 180000);
        assert.equal(rubles(app.element('opportunity-difference').textContent), 550748);
    }
});

test('car/taxi shows the same breakdown and bar scale in two periods', () => {
    const app = page();
    const { element } = app;
    assert.equal(rubles(element('car-cash').textContent), 11062);
    assert.equal(rubles(element('car-loss').textContent), 23833);
    const relativeTaxi = Number.parseFloat(element('taxi-bar').style.width);
    assert.ok(Math.abs(relativeTaxi - 180000 / 418748 * 100) < 0.001);
    app.period('year');
    assert.equal(element('verdict-title').textContent, 'Такси дешевле на 238 748 ₽/год');
    assert.equal(rubles(element('car-cash').textContent), 132748);
    assert.equal(rubles(element('car-loss').textContent), 286000);
    assert.equal(rubles(element('car-fuel').textContent), 17748);
    assert.equal(rubles(element('car-fixed').textContent), 115000);
    assert.equal(element('mobile-difference').textContent, '238 748 ₽/год');
    assert.equal(Number.parseFloat(element('taxi-bar').style.width), relativeTaxi);
    assert.deepEqual(app.goals, []);
});

test('car/taxi adds only entered annual expenses, preserving zero and omitted values', () => {
    const app = page();
    app.period('year');
    for (const [value, expected] of [['', 418748], ['0', 418748], ['12 000', 430748]]) {
        app.edit('other-expenses', value);
        assert.equal(rubles(app.element('car-total').textContent), expected);
    }
    assert.equal(app.element('preset-comfort').getAttribute('aria-pressed'), 'false');
    app.run("applyCarPreset('economy', true)");
    assert.equal(app.element('other-expenses').value, '12 000');
    assert.equal(rubles(app.element('car-other').textContent), 12000);
});

test('car/taxi rejects invalid edits and suspends all result exports until recovery', () => {
    const app = page();
    app.rate('12');
    for (const [id, value, correct] of [
        ['taxi-trip-distance', '', '10'], ['taxi-trip-distance', '0', '10'], ['taxi-trip-distance', '10001', '10'],
        ['taxi-trip-distance', '-0.1', '10'], ['trips-per-month', '1.5', '30'], ['insurance', '99oops', '80000'],
        ['maintenance', '1e3', '35000'], ['other-expenses', '-1', ''], ['car-price', '1 00', '2600000']
    ]) {
        app.edit(id, value);
        assert.equal(app.element(id).getAttribute('aria-invalid'), 'true');
        assert.equal(app.element('verdict-title').textContent, 'Проверьте условия расчёта');
        assert.equal(app.element('result-body').hidden, true);
        assert.equal(app.element('trip-sticky').hidden, true);
        assert.equal(app.element('opportunity-result').hidden, true);
        assert.equal(app.run('window.canExportCalculation()'), false);
        app.edit(id, correct);
        assert.equal(app.element(id).getAttribute('aria-invalid'), undefined);
        assert.equal(app.run('window.canExportCalculation()'), true);
    }
    assert.deepEqual(app.goals, []);
});

test('car/taxi differentiates close, equal and zero-mileage states', () => {
    const app = page();
    app.edit('trip-price', '1163,19');
    assert.equal(app.element('verdict-title').textContent, 'Расходы близки');
    assert.match(app.element('verdict-detail').textContent, /^Разница 0,03\s₽\/мес\., такси дороже/);
    app.period('year');
    assert.match(app.element('verdict-detail').textContent, /^Разница 0,4\s₽\/год/);
    app.edit('trips-per-month', '0');
    assert.equal(app.element('car-per-km').textContent, 'Нет пробега');
    assert.equal(rubles(app.element('taxi-total').textContent), 0);
    assert.equal(rubles(app.element('car-total').textContent), 401000);
    for (const id of ['insurance', 'maintenance', 'depreciation-range']) app.edit(id, '0');
    assert.equal(app.element('verdict-title').textContent, 'Расходы равны');
    assert.equal(app.element('car-bar').style.width, '0%');
    assert.equal(app.element('taxi-bar').style.width, '0%');
});

test('car/taxi reflects the matching preset and current price without a stale label', () => {
    const app = page();
    const context = app.element('result-car-context');
    assert.equal(context.textContent, 'Geely Coolray · 2,6 млн ₽');
    app.period('year');
    assert.equal(context.textContent, 'Geely Coolray · 2,6 млн ₽');
    app.run("applyCarPreset('premium', true)");
    assert.equal(context.textContent, 'EXEED RX · 4,7 млн ₽');
    app.edit('car-price', '2679183,50');
    assert.equal(context.textContent, 'Свои параметры · 2 679 183,5 ₽');
    app.edit('car-price', '');
    assert.equal(context.textContent, 'Уточните цену автомобиля');
    assert.equal(app.element('verdict-figure').hidden, true);
});

test('car/taxi formats numeric drafts without changing precision or accepting malformed groups', () => {
    const app = page();
    for (const [id, raw, expected] of [
        ['car-price', '200000', '200 000'], ['car-price', '12500.50', '12 500,50'],
        ['car-price', '2 600 000,00', '2 600 000,00'], ['car-price', '0,', '0,'],
        ['taxi-trip-distance', '1.250', '1,250'], ['car-price', '1 00', '1 00'],
        ['trips-per-month', '1.5', '1.5'], ['opportunity-rate', '.50', ',50']
    ]) {
        app.edit(id, raw);
        assert.equal(app.element(id).value, expected);
    }
    assert.equal(app.element('trips-per-month').getAttribute('aria-invalid'), 'true');
    assert.equal(app.element('opportunity-rate').getAttribute('aria-invalid'), undefined);
});

test('car/taxi tracks a real valid change once and skips autofill, setup, equivalent edits and scenarios', () => {
    const app = page();
    app.edit('trip-price', '501', { inputType: 'insertReplacementText' });
    app.edit('trip-price', '502', { trusted: false });
    app.edit('trip-price', '502,00');
    app.rate('12');
    app.run("applyCarPreset('comfort', true)");
    assert.deepEqual(app.goals, []);
    app.run("applyCarPreset('premium', true)");
    app.edit('trip-price', '550');
    assert.deepEqual(app.goals, [['calculate_success']]);
    const typed = page();
    typed.edit('other-expenses', '1');
    typed.edit('trip-price', '550');
    assert.deepEqual(typed.goals, [['calculate_success']]);
});
