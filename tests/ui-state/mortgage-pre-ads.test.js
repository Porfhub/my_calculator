const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mortgage = fs.readFileSync(path.join(__dirname, '../../mortgage.html'), 'utf8');
const trust = fs.readFileSync(path.join(__dirname, '../../js/trust-layer.js'), 'utf8');
const utilities = fs.readFileSync(path.join(__dirname, '../../js/ui-utils.js'), 'utf8');
const script = mortgage.slice(mortgage.indexOf('<script>', mortgage.indexOf('id="mobile-overpayment"')) + 8, mortgage.lastIndexOf('</script>'));

function page() {
    const elements = new Map();
    const listeners = {};
    const goals = [];
    const transitions = [];
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, {
            innerText: '', innerHTML: '', classList: { add() {}, remove() {} }
        });
        return elements.get(id);
    };
    const document = {
        getElementById: (id) => ['ratioDonutChart', 'balanceChart'].includes(id) ? null : element(id),
        addEventListener: (name, listener) => { (listeners[name] ??= []).push(listener); }
    };
    const context = vm.createContext({
        document, window: {}, Intl, console: { error() {} },
        reachGoal: (goal) => goals.push(goal),
        CalculatorState: {
            STATES: { READY: 'READY', INVALID_INPUT: 'INVALID_INPUT', CALCULATION_IMPOSSIBLE: 'CALCULATION_IMPOSSIBLE' },
            createController: () => ({ transition: (status) => {
                transitions.push(status);
                if (status !== 'READY') for (const id of ['res-total-interest', 'res-bank-interest', 'res-insurance', 'res-all-paid']) element(id).innerText = '—';
            }, getState: () => transitions.at(-1) })
        }
    });
    vm.runInContext(script, context);
    vm.runInContext('renderAmortizationTable = () => {}; updateChart = () => {};', context);
    const run = (expression) => vm.runInContext(expression, context);
    const value = (id) => Number(element(id).innerText.replace(/[^\d]/g, ''));
    return { run, value, element, goals, transitions, edit: () => listeners.input.forEach((listener) => listener({ target: { closest: () => ({}) } })) };
}

test('insurance accounting, labels and methodology agree for both settings', () => {
    const p = page();
    p.run('updateCalculations()');
    assert.deepEqual(p.goals, []); // Initial automatic render is not a conversion.
    const principal = p.value('res-loan-amount');
    const payment = p.value('res-monthly-payment');
    const without = p.run('simulateMortgage(true)');
    assert.equal(principal, 8000000);
    assert.equal(payment, Math.round(without.schedule[0].payment));
    assert.equal(without.totalInsurance, 0);
    assert.equal(p.value('res-insurance'), 0);
    assert.equal(p.value('res-bank-interest'), p.value('res-total-interest'));
    assert.equal(p.value('res-all-paid'), principal + p.value('res-total-interest'));
    assert.equal(p.value('res-total-interest'), 18712114);
    assert.equal(p.value('res-all-paid'), 26712114);
    assert.match(p.element('savings-card').innerHTML, /data-screenshot-fallback/);
    assert.match(p.element('savings-card').innerHTML, /10.000.000|10 000 000|10 000 000/);

    p.edit();
    p.run('state.includeInsurance = true; updateCalculations()');
    const insured = p.run('simulateMortgage(true)');
    assert.equal(p.value('res-monthly-payment'), payment);
    assert.equal(p.value('res-bank-interest'), Math.round(insured.totalInterest));
    assert.equal(p.value('res-insurance'), Math.round(insured.totalInsurance));
    assert.equal(p.value('res-total-interest'), Math.round(insured.totalInterest) + Math.round(insured.totalInsurance));
    assert.equal(p.value('res-all-paid'), principal + p.value('res-total-interest'));
    assert.equal(p.value('res-bank-interest'), 18712114);
    assert.equal(p.value('res-insurance'), 1205122);
    assert.equal(p.value('res-total-interest'), 19917236);
    assert.equal(p.value('res-all-paid'), 27917236);
    assert.ok(Math.abs(insured.totalPaid - (principal + insured.totalInterest + insured.totalInsurance)) < 0.01);
    assert.match(mortgage, /Переплата = проценты по ипотеке \+ учтённая страховка/);
    assert.match(mortgage, /Проценты банку: <strong id="res-bank-interest"/);
    assert.match(mortgage, /Страховка: <strong id="res-insurance"/);
    assert.match(trust, /При включённой страховке модель добавляет около 1% от остатка долга в начале каждого года кредита/);
    assert.match(trust, /Переплата = проценты по ипотеке \+ учтённая страховка/);
    assert.match(trust, /Страховка — приблизительный сценарий/);
    assert.doesNotMatch(trust, /Не учитывает все условия договора, страховки/);
    assert.deepEqual(p.goals, ['calculate_success']);
});

test('future payment copy includes the down-payment exclusion and keeps the calculation unchanged', () => {
    const p = page();
    p.run('updateCalculations()');
    assert.equal(p.element('label-total-paid').innerText, 'Сумма выплат');
    assert.equal(p.element('total-paid-note').innerText, 'без первоначального взноса');
    assert.equal(p.value('res-all-paid'), p.value('res-loan-amount') + p.value('res-total-interest'));
    assert.match(mortgage, /id="label-total-paid">Сумма выплат<\/span>/);
    assert.match(mortgage, /id="total-paid-note"[^>]*>без первоначального взноса<\/span>/);
    assert.doesNotMatch(mortgage, /id="label-total-paid">Всего выплачено/);
    assert.doesNotMatch(mortgage, /'Всего выплачено'\s*:\s*'Всего выплатить по остатку'/);
    assert.match(trust, /сумма выплат = сумма кредита \+ переплата, без первоначального взноса/);
    assert.doesNotMatch(trust, /всего выплачено = сумма кредита/);
});

test('portrait PNG composes three result cards before the chart and omits controls', () => {
    const panel = mortgage.slice(mortgage.indexOf('id="results-panel"'), mortgage.indexOf('</main>'));
    const hero = panel.indexOf('id="res-total-interest"');
    const ratio = panel.indexOf('id="ratioDonutChart"');
    const savings = panel.indexOf('id="savings-card"');
    const chart = panel.indexOf('id="balanceChart"');
    assert.ok(hero >= 0 && hero < ratio && ratio < savings && savings < chart);
    assert.match(panel, /data-screenshot-width="560"/);
    assert.match(panel, /id="chart-title">Динамика остатка долга/);
    assert.match(panel, /Зеленая линия \(сплошная\)/);
    assert.match(panel, /Серая линия \(пунктир\)/);
    assert.match(panel, /takeScreenshot\('results-panel', 'yasnomera-mortgage-calculation.png'\)/);
    assert.match(utilities, /const portraitWidth = Number\(source\.dataset\.screenshotWidth\)/);
    assert.match(utilities, /copyCanvasContents\(source, clone\)/);
    assert.match(utilities, /clone\.querySelectorAll\('\[data-screenshot-fallback\]'\)/);
    assert.match(utilities, /clone\.querySelectorAll\(SCREENSHOT_EXCLUDED_SELECTORS\)\.forEach\(\(node\) => node\.remove\(\)\)/);
    assert.match(utilities, /'\.tooltip'/);
    assert.match(utilities, /'button'/);
    assert.match(utilities, /'\.mobile-sticky-results'/);
    assert.match(mortgage, /id="existing-history-card" data-screenshot-exclude/);
    assert.match(mortgage, /<div data-screenshot-exclude class="grid grid-cols-2 gap-3">\s*<button onclick="shareLink\(\)"/);
});

test('isolated portrait export clone copies chart pixels and reveals only export summary', () => {
    const exporter = utilities.slice(utilities.indexOf('const SCREENSHOT_EXCLUDED_SELECTORS'), utilities.indexOf('function renderScreenshot('));
    const removed = [];
    const summaryParent = { classList: { remove: (name) => removed.push(`summary:${name}`) } };
    const summary = { parentElement: summaryParent };
    const flush = { style: {} };
    const images = [{ style: {} }, { style: {} }];
    const canvasClones = images.map((image) => ({
        replaceWith: (node) => Object.assign(image, node),
        remove() { throw new Error('chart omitted'); }
    }));
    const excluded = [{ remove: () => removed.push('control') }, { remove: () => removed.push('tooltip') }];
    const source = {
        dataset: { screenshotWidth: '560' },
        getBoundingClientRect: () => ({ width: 900 }),
        querySelectorAll: (selector) => selector === 'canvas'
            ? ['donut', 'chart'].map((name) => ({ toDataURL: () => `data:image/png;base64,${name}` })) : [],
        cloneNode: () => clone
    };
    const clone = {
        style: {}, removeAttribute() {},
        querySelectorAll: (selector) => ({
            '[data-screenshot-flush]': [flush],
            '[data-screenshot-fallback]': [summary],
            '[id]': [], canvas: canvasClones, img: images, '*': []
        }[selector] ?? excluded)
    };
    const stage = { style: {}, setAttribute() {}, append(node) { this.child = node; } };
    const context = vm.createContext({
        document: { createElement: (tag) => tag === 'div' ? stage : { style: {} }, body: { append() {} } },
        window: { getComputedStyle: () => ({ width: '700px', height: '200px', display: 'block' }) },
        console
    });
    vm.runInContext(exporter, context);
    context.source = source;
    const result = vm.runInContext('createScreenshotStage(source)', context);
    assert.equal(result, stage);
    assert.match(stage.style.cssText, /width:560px/);
    assert.equal(clone.style.position, 'static');
    assert.equal(flush.style.margin, '0');
    assert.deepEqual(images.map((image) => image.src), ['data:image/png;base64,donut', 'data:image/png;base64,chart']);
    assert.ok(images.every((image) => image.style.maxWidth === '100%' && image.style.objectFit === 'contain'));
    assert.deepEqual(removed, ['summary:hidden', 'control', 'tooltip']);
});

test('calculate_success follows a valid result update, never invalid input or render alone, and fires once', () => {
    const p = page();
    p.run('state.rate = NaN');
    p.edit();
    p.run('updateCalculations()');
    assert.equal(p.transitions.at(-1), 'INVALID_INPUT');
    assert.equal(p.element('res-total-interest').innerText, '—');
    assert.deepEqual(p.goals, []);
    p.run('state.rate = 16; updateCalculations()');
    assert.equal(p.transitions.at(-1), 'READY');
    assert.deepEqual(p.goals, ['calculate_success']);
    p.run('updateCalculations()');
    assert.deepEqual(p.goals, ['calculate_success']);
});

test('a failed result update cannot send the success goal', () => {
    const p = page();
    p.edit();
    p.run('renderAmortizationTable = () => { throw new Error("render failed"); }; updateCalculations()');
    assert.equal(p.transitions.at(-1), 'CALCULATION_IMPOSSIBLE');
    assert.deepEqual(p.goals, []);
});

test('mortgage scenarios preserve payment and interest direction and finite results', () => {
    const p = page();
    const scenario = (down, rate, years) => {
        const result = p.run(`state.downPayment = ${down}; state.rate = ${rate}; state.termYears = ${years}; simulateMortgage(true)`);
        p.run('updateCalculations()');
        assert.equal(p.transitions.at(-1), 'READY');
        assert.ok(Number.isFinite(result.totalInterest) && Number.isFinite(result.totalPaid));
        assert.ok(result.schedule.every((month) => Number.isFinite(month.payment) && Number.isFinite(month.balance)));
        assert.ok(!/NaN|Infinity/.test(p.element('res-total-interest').innerText));
        return { principal: 10000000 - down, payment: result.schedule[0].payment, interest: result.totalInterest };
    };
    const a = scenario(2000000, 16, 20);
    const b = scenario(5000000, 16, 20);
    const c = scenario(2000000, 16, 5);
    const d = scenario(2000000, 16, 30);
    const e = scenario(2000000, 10, 20);
    assert.ok(b.principal < a.principal && b.payment < a.payment && b.interest < a.interest);
    assert.ok(c.payment > a.payment && c.interest < a.interest);
    assert.ok(d.payment < a.payment && d.interest > a.interest);
    assert.ok(e.payment < a.payment && e.interest < a.interest);
});
