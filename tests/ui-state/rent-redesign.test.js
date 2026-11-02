const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'rent-vs-mortgage.html'), 'utf8');
const model = require(path.join(root, 'js/rent-vs-mortgage-model.js'));
const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const script = scripts.find(s => s.includes('const state ='));

function page(url = 'https://yasnomera.ru/rent-vs-mortgage.html') {
    const elements = new Map();
    const goals = [], errors = [], copies = [], notices = [];
    const element = id => {
        if (!elements.has(id)) throw new Error('Unknown DOM element: ' + id);
        return elements.get(id);
    };
    for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
        const tag = m[0], attrs = {};
        const classes = new Set();
        const node = { value: tag.match(/\bvalue="([^"]*)"/)?.[1] || '', innerText: '', textContent: '', hidden: /\bhidden\b/.test(tag), dataset: { money: tag.match(/data-money="([^"]+)"/)?.[1] }, listeners: {}, style: { setProperty() {} },
            min: tag.match(/\bmin="([^"]*)"/)?.[1], max: tag.match(/\bmax="([^"]*)"/)?.[1],
            classList: { add: s => classes.add(s), remove: s => classes.delete(s), contains: s => classes.has(s), toggle: (s, on) => on ? classes.add(s) : classes.delete(s) },
            setAttribute: (k,v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; }, getAttribute: k => attrs[k],
            addEventListener: (k,fn) => { node.listeners[k] = fn; }, getContext: () => ({}), showModal: () => { node.open = true; }, select() {}
        };
        elements.set(m[1], node);
    }
    let throwChart = false;
    const document = { getElementById: element, activeElement: null, documentElement: { classList: { contains: () => false } } };
    const window = { addEventListener() {} };
    const context = vm.createContext({ document, window, location: { href: url }, URL, JSON, Object, Number, Intl,
        navigator: { clipboard: { writeText: async text => copies.push(text) } },
        console: { error: (...args) => errors.push(args) },
        MutationObserver: class { observe() {} },
        Chart: class { constructor() { if (throwChart) throw new Error('Chart render failed'); } destroy() {} },
        RentVsMortgageModel: model,
        formatMoney: value => Math.round(value).toLocaleString('ru-RU') + ' ₽',
        getYearWord: n => n === 1 ? 'год' : n < 5 ? 'года' : 'лет',
        reachGoal: goal => goals.push(goal), showToast: message => notices.push(message),
        canExportCurrentCalculation: () => window.canExportCalculation()
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/calculator-state.js'), 'utf8'), context);
    context.CalculatorState = window.CalculatorState;
    vm.runInContext(script, context);
    const run = expression => vm.runInContext(expression, context);
    const edit = (id, value, type = 'input') => {
        const node = element(id); node.value = value; document.activeElement = node;
        node.listeners[type]({ target: node });
    };
    return { run, edit, element, goals, errors, copies, notices, document, window, chartFailure: value => { throwChart = value; } };
}

test('rent exact fields preserve numbers and comma decimals without moving the cursor', () => {
    const p = page();
    assert.deepEqual(p.goals, []);
    p.edit('cost-input', '12 345 678');
    assert.equal(p.run('state.cost'), 12345678);
    assert.equal(p.element('cost-input').value, '12 345 678');
    p.edit('rate-input', '12,35');
    assert.equal(p.run('state.rate'), 12.35);
    assert.equal(p.element('rate-input').value, '12,35');
    assert.equal(p.window.canExportCalculation(), true);
    assert.deepEqual(p.goals, ['calculate_success']);
});

test('rent invalid input clears the result and prevents false conversions until recovery', () => {
    const p = page();
    for (const value of ['', 'abc', '-1', '0']) {
        p.edit('cost-input', value);
        assert.equal(p.window.canExportCalculation(), false);
        assert.equal(p.element('verdict-card').hidden, true);
        assert.equal(p.element('rent-state-message').hidden, false);
    }
    assert.deepEqual(p.goals, []);
    p.edit('cost-input', '8000000');
    assert.equal(p.window.canExportCalculation(), true);
    assert.equal(p.element('rent-state-message').hidden, true);
    p.edit('rent-input', '40000');
    assert.deepEqual(p.goals, ['calculate_success']);
});

test('rent down payment is a percentage, rejects 100%, and stays paired with its range', () => {
    const p = page();
    p.edit('deposit-input', '25');
    assert.equal(p.run('state.dpPercent'), .25);
    assert.equal(p.element('dp-range').value, .25);
    p.edit('dp-range', '.35');
    assert.equal(p.run('state.dpPercent'), .35);
    assert.equal(p.element('deposit-input').value, '35');
    p.edit('deposit-input', '100');
    assert.equal(p.window.canExportCalculation(), false);
});

test('changing the comparison horizon never changes the mortgage payment', () => {
    const p = page();
    const payment = p.run('renderedResult.mortgagePayment');
    p.edit('years-input', '5');
    assert.equal(p.run('renderedResult.mortgagePayment'), payment);
    assert.ok(p.run('renderedResult.remainingMortgageDebt') > 0);
    p.edit('mortgage-term-input', '5');
    assert.ok(p.run('renderedResult.mortgagePayment') > payment);
    p.edit('years-input', '4');
    assert.equal(p.window.canExportCalculation(), false);
});

test('collapsing assumptions retains financial inputs and is not a conversion', () => {
    const p = page();
    const node = p.element('market-assumptions'); node.open = true;
    node.listeners.toggle({ target: node });
    assert.deepEqual(p.goals, []);
    p.edit('growth-re', '-2');
    const before = p.run('renderedResult.buyFinal');
    node.open = false; node.listeners.toggle({ target: node });
    assert.equal(p.run('state.growthRE'), -2);
    assert.equal(p.run('renderedResult.buyFinal'), before);
    assert.equal(p.window.canExportCalculation(), true);
});

test('chart failure fails closed, prevents a conversion and can recover', () => {
    const p = page(); p.chartFailure(true);
    p.edit('rate-input', '10');
    assert.equal(p.window.canExportCalculation(), false);
    assert.deepEqual(p.goals, []);
    p.chartFailure(false); p.edit('rate-input', '11');
    assert.equal(p.window.canExportCalculation(), true);
    assert.deepEqual(p.goals, ['calculate_success']);
});

test('share restores all financial inputs, preserves UTM and never counts an opening as success', async () => {
    const p = page('https://yasnomera.ru/rent-vs-mortgage.html?utm_source=qa');
    p.edit('cost-input', '12345678'); p.edit('years-input', '7'); p.edit('growth-re', '-1.5');
    p.element('include-investments').checked = true;
    p.element('include-investments').listeners.change({ target: p.element('include-investments') });
    p.edit('invest-input', '8,5');
    await p.run('shareRentScenario()');
    assert.equal(new URL(p.copies[0]).searchParams.get('utm_source'), 'qa');
    const restored = page(p.copies[0]);
    for (const key of ['cost','rate','dpPercent','rent','includeInvestments','investRate','growthRE','growthRent','mortgageTermYears','analysisYears']) assert.equal(restored.run(`state.${key}`), p.run(`state.${key}`));
    assert.deepEqual(restored.goals, []);
    assert.equal(restored.element('scenario-label').innerText, 'По ссылке');
    assert.equal(restored.run('renderedResult.rentFinal'), p.run('renderedResult.rentFinal'));
});

test('malformed shares open the valid example with a notice and no conversion', () => {
    for (const raw of ['broken', '{"v":2}', '{"v":1,"s":{"cost":"bad"}}']) {
        const p = page('https://yasnomera.ru/rent-vs-mortgage.html?rv=' + encodeURIComponent(raw));
        assert.equal(p.run('state.cost'), 10000000);
        assert.equal(p.window.canExportCalculation(), true);
        assert.equal(p.notices.length, 1);
        assert.deepEqual(p.goals, []);
    }
});

test('clipboard refusal exposes a selectable URL and invalid state blocks sharing', async () => {
    const p = page(); p.run('navigator.clipboard = undefined');
    await p.run('shareRentScenario()');
    assert.equal(p.element('share-dialog').open, true);
    assert.match(p.element('share-url').value, /rv=/);
    p.edit('rate-input', '');
    await p.run('shareRentScenario()');
    assert.deepEqual(p.goals, ['share_click']);
});

test('negative renter balance is disclosed, not painted as zero wealth', () => {
    const p = page(); p.edit('rent-input', '300000');
    assert.equal(p.element('rent-deficit').hidden, false);
    assert.match(p.element('rent-deficit').innerText, /Дефицит по модели/);
    assert.ok(p.run('renderedResult.rentFinal') < 0);
});
