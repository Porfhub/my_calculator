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

test('down payment accepts exact rubles or percentages and rejects a full-price deposit', () => {
    const p = page();
    p.edit('deposit-input', '1 032 000');
    assert.equal(p.run('state.dpPercent'), .1032);
    assert.equal(p.element('deposit-percent-input').value, '10.32');
    p.edit('deposit-percent-input', '25,35');
    assert.equal(p.run('state.dpPercent'), .2535);
    assert.equal(p.element('deposit-input').value.replace(/\s/g, ''), '2535000');
    p.edit('dp-range', '.35');
    assert.equal(p.run('state.dpPercent'), .35);
    assert.equal(p.element('deposit-percent-input').value, '35');
    p.edit('deposit-input', '10000000');
    assert.equal(p.window.canExportCalculation(), false);
    assert.equal(p.element('deposit-input').getAttribute('aria-invalid'), 'true');
    p.edit('deposit-percent-input', '100');
    assert.equal(p.window.canExportCalculation(), false);
    p.edit('deposit-input', '0');
    assert.equal(p.window.canExportCalculation(), true);
});

 test('changing price retains the last entered deposit amount or percentage', () => {
    const p = page();
    p.edit('deposit-input', '1500000');
    p.edit('cost-input', '12000000');
    assert.equal(p.run('state.dpPercent'), .125);
    assert.equal(p.run('depositAmount'), 1500000);
    p.edit('deposit-percent-input', '20');
    p.edit('cost-input', '8000000');
    assert.equal(p.run('state.dpPercent'), .2);
    assert.equal(p.run('depositAmount'), 1600000);
    p.edit('deposit-input', '1500000');
    p.edit('cost-input', '1000000');
    assert.equal(p.window.canExportCalculation(), false);
    p.edit('cost-input', '10000000');
    assert.equal(p.run('state.dpPercent'), .15);
    assert.equal(p.window.canExportCalculation(), true);
});

 test('empty price or deposit recovers without losing the last entered amount', () => {
    const p = page();
    p.edit('deposit-input', '1234567,89');
    p.edit('cost-input', '');
    assert.equal(p.window.canExportCalculation(), false);
    p.edit('cost-input', '10000000');
    assert.equal(p.run('depositAmount'), 1234567.89);
    assert.equal(p.window.canExportCalculation(), true);
    p.edit('deposit-input', '');
    assert.equal(p.window.canExportCalculation(), false);
    p.edit('deposit-percent-input', '20');
    assert.equal(p.run('depositAmount'), 2000000);
    assert.equal(p.window.canExportCalculation(), true);
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

const moneyNumber = text => Number(text.replace(/[^0-9−-]/g, '').replace('−', '-'));

test('visible ledger adds up to hero totals before and after payoff, with and without income', () => {
    const p = page();
    for (const include of [false, true]) {
        p.element('include-investments').checked = include;
        p.element('include-investments').listeners.change({target:p.element('include-investments')});
        for (const years of ['5', '20', '40']) {
            p.edit('years-input', years);
            const value = id => moneyNumber(p.element(id).innerText);
            assert.equal(value('ledger-property') + value('ledger-debt'), value('ledger-buy-total'));
            assert.equal(value('ledger-deposit') + value('ledger-cashflow') + value('ledger-return'), value('ledger-rent-total'));
            assert.equal(value('ledger-buy-total'), p.run('renderedResult.buyFinal'));
            assert.equal(value('ledger-rent-total'), p.run('renderedResult.rentFinal'));
            assert.equal(p.element('ledger-return-row').hidden, !include);
        }
    }
});

test('negative cash flow and deficit retain signs and invalid inputs clear the ledger', () => {
    const p = page();
    p.edit('rent-input', '300000');
    assert.ok(moneyNumber(p.element('ledger-cashflow').innerText) < 0);
    assert.ok(moneyNumber(p.element('ledger-rent-total').innerText) < 0);
    assert.equal(p.element('ledger-rent-total-label').innerText, 'Дефицит по модели');
    p.edit('rent-input', '');
    assert.equal(p.element('ledger-rent-total').textContent, '—');
    assert.equal(p.window.canExportCalculation(), false);
    p.edit('rent-input', '50000');
    assert.equal(p.window.canExportCalculation(), true);
    assert.ok(moneyNumber(p.element('ledger-rent-total').innerText) > 0);
});

test('legacy version-one share preserves the exact percentage with a ruble-first form', async () => {
    const p = page();
    p.edit('deposit-percent-input', '10,32');
    await p.run('shareRentScenario()');
    const restored = page(p.copies[0]);
    assert.equal(restored.run('state.dpPercent'), .1032);
    assert.equal(restored.run('depositAmount'), 1032000);
    assert.equal(restored.element('deposit-percent-input').value, '10.32');
    assert.deepEqual(restored.goals, []);
});

test('cash flow ledger reconciles independently across loss, gain and zero-interest scenarios', () => {
    for (const includeInvestments of [false, true]) for (const rent of [1000, 300000]) for (const analysisYears of [5,20,40]) {
        const state = { cost:10000000, dpPercent:.1032, rate:0, rent, investRate:8, includeInvestments, growthRE:-2, growthRent:4, mortgageTermYears:20, analysisYears };
        const r = model.calculateScenario(state);
        const tolerance = Math.max(0.0001, Math.abs(r.rentFinal) * 1e-12);
        assert.ok(Math.abs(r.initialRenterCapital + r.totalMonthlyDifference + r.totalInvestmentReturn - r.rentFinal) <= .5 + tolerance);
        assert.ok(Math.abs(r.finalPropertyValue - r.remainingMortgageDebt - r.buyFinal) <= .5 + tolerance);
        if (!includeInvestments) assert.equal(r.totalInvestmentReturn, 0);
    }
});
