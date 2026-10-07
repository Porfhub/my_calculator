const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mortgage = fs.readFileSync(path.join(__dirname, '../../mortgage.html'), 'utf8');
const trust = fs.readFileSync(path.join(__dirname, '../../js/trust-layer.js'), 'utf8');
const utilities = fs.readFileSync(path.join(__dirname, '../../js/ui-utils.js'), 'utf8');
const script = mortgage.slice(mortgage.indexOf('<script>', mortgage.indexOf('id="mobile-overpayment"')) + 8, mortgage.lastIndexOf('</script>'));

function page({ withCanvases = false, stubChart = true, withVisualViewport = true, mobile = true } = {}) {
    const elements = new Map();
    const listeners = {};
    const viewportListeners = {};
    const windowListeners = {};
    const goals = [];
    const transitions = [];
    const transitionDetails = [];
    const errors = [];
    const bodyClasses = new Set();
    const scrollCalls = [];
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, {
            innerText: '', innerHTML: '', value: '', selectionStart: 0,
            classList: { add() {}, remove() {} }, getContext: () => ({}), setSelectionRange() {}
        });
        return elements.get(id);
    };
    const document = {
        getElementById: (id) => ['ratioDonutChart', 'balanceChart'].includes(id) && !withCanvases ? null : element(id),
        addEventListener: (name, listener) => { (listeners[name] ??= []).push(listener); },
        activeElement: null,
        body: { classList: { add: (name) => bodyClasses.add(name), remove: (name) => bodyClasses.delete(name) } },
        documentElement: { classList: { contains: () => false } }
    };
    const visualViewport = {
        height: 844,
        width: 390,
        offsetTop: 0,
        addEventListener: (name, listener) => { (viewportListeners[name] ??= []).push(listener); }
    };
    const window = {
        innerHeight: 844,
        matchMedia: () => ({ matches: mobile }),
        setTimeout: (callback) => { callback(); return 1; },
        clearTimeout() {},
        addEventListener: (name, listener) => { (windowListeners[name] ??= []).push(listener); }
    };
    if (withVisualViewport) window.visualViewport = visualViewport;
    const context = vm.createContext({
        document, window, Intl, console: { error: (...args) => errors.push(args.map(String).join(' ')) },
        reachGoal: (goal) => goals.push(goal),
        CalculatorState: {
            STATES: { READY: 'READY', INVALID_INPUT: 'INVALID_INPUT', CALCULATION_IMPOSSIBLE: 'CALCULATION_IMPOSSIBLE' },
            createController: () => ({ transition: (status, details = {}) => {
                transitions.push(status);
                transitionDetails.push({ status, ...details });
                if (status !== 'READY') for (const id of ['res-total-interest', 'res-bank-interest', 'res-insurance', 'res-all-paid']) element(id).innerText = '—';
            }, getState: () => transitions.at(-1) })
        }
    });
    vm.runInContext(script, context);
    vm.runInContext('renderAmortizationTable = () => {};', context);
    if (stubChart) vm.runInContext('updateChart = () => {};', context);
    const run = (expression) => vm.runInContext(expression, context);
    const value = (id) => Number(element(id).innerText.replace(/[^\d]/g, ''));
    const focusedInputs = [0, 1].map(() => ({
        matches: () => true,
        scrollIntoView: (options) => scrollCalls.push(options)
    }));
    return {
        run, value, element, goals, transitions, transitionDetails, errors, bodyClasses, scrollCalls,
        edit: () => listeners.input.forEach((listener) => listener({ target: { closest: () => ({}) } })),
        focusInput: (index = 0) => {
            const previous = document.activeElement;
            const next = focusedInputs[index];
            document.activeElement = next;
            if (previous) listeners.focusout.forEach((listener) => listener({ target: previous }));
            listeners.focusin.forEach((listener) => listener({ target: next }));
        },
        blurInput: () => {
            const previous = document.activeElement;
            document.activeElement = null;
            if (previous) listeners.focusout.forEach((listener) => listener({ target: previous }));
        },
        resizeViewport: (height) => {
            visualViewport.height = height;
            (viewportListeners.resize ?? []).forEach((listener) => listener());
        },
        resizeWindow: (height) => {
            window.innerHeight = height;
            (windowListeners.resize ?? []).forEach((listener) => listener());
        },
        hasFocusedInput: () => focusedInputs.includes(document.activeElement)
    };
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
    assert.match(panel, /id="results-panel" data-screenshot-width="560"/);
    assert.match(panel, /id="screenshot-area" data-screenshot-flush class="space-y-6/);
    assert.doesNotMatch(panel, /id="panel-new"|id="panel-existing"|id="theme-toggle"|<nav/);
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
    const stage = { style: {}, dataset: {}, setAttribute() {}, append(node) { this.child = node; } };
    let darkMode = false;
    const context = vm.createContext({
        document: {
            createElement: (tag) => tag === 'div' ? stage : { style: {} },
            documentElement: { classList: { contains: () => darkMode } },
            body: { append() {} }
        },
        window: { getComputedStyle: () => ({ width: '700px', height: '200px', display: 'block' }) },
        console
    });
    vm.runInContext(exporter, context);
    context.source = source;
    const result = vm.runInContext('createScreenshotStage(source)', context);
    assert.equal(result, stage);
    assert.match(stage.style.cssText, /width:600px/);
    assert.match(stage.style.cssText, /padding:20px/);
    assert.match(stage.style.cssText, /box-sizing:border-box/);
    assert.match(stage.style.cssText, /background:#f8fafc/);
    assert.equal(stage.dataset.screenshotBackground, '#f8fafc');
    assert.equal(clone.style.position, 'static');
    assert.equal(flush.style.margin, '0');
    assert.equal(flush.style.padding, '0');
    assert.equal(flush.style.background, 'transparent');
    assert.deepEqual(images.map((image) => image.src), ['data:image/png;base64,donut', 'data:image/png;base64,chart']);
    assert.ok(images.every((image) => image.style.maxWidth === '100%' && image.style.objectFit === 'contain'));
    assert.deepEqual(removed, ['summary:hidden', 'control', 'tooltip']);
    assert.match(mortgage, /id="results-panel" data-screenshot-width="560"/);
    assert.match(mortgage, /class="[^"]*space-y-6" id="results-panel"/);
    vm.runInContext(utilities.slice(utilities.indexOf('function renderScreenshot('), utilities.indexOf('function canvasToBlob(')), context);
    context.html2canvas = (_, options) => options;
    context.stage = stage;
    assert.equal(vm.runInContext('renderScreenshot(stage).backgroundColor', context), '#f8fafc');
    darkMode = true;
    vm.runInContext('createScreenshotStage(source)', context);
    assert.match(stage.style.cssText, /background:#020617/);
    assert.equal(vm.runInContext('renderScreenshot(stage).backgroundColor', context), '#020617');
    darkMode = false;
    delete source.dataset.screenshotWidth;
    vm.runInContext('createScreenshotStage(source)', context);
    assert.match(stage.style.cssText, /width:900px/);
    assert.doesNotMatch(stage.style.cssText, /padding:20px/);
    assert.match(stage.style.cssText, /background:#f8fafc/);
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

test('detail and chart rendering failures keep the calculated result ready without sending the success goal', () => {
    for (const [renderer, logMessage, stage] of [
        ['renderAmortizationTable', 'Mortgage amortization table rendering skipped', 'schedule_render'],
        ['updateChart', 'Mortgage balance chart rendering skipped', 'chart_render']
    ]) {
        const p = page();
        p.run('window.__diagnosticCalls = []; window.ym = (...args) => window.__diagnosticCalls.push(args)');
        p.edit();
        p.run(`${renderer} = () => { throw new Error("render failed"); }; updateCalculations()`);
        assert.equal(p.transitions.at(-1), 'READY');
        assert.equal(p.value('res-loan-amount'), 8000000);
        assert.ok(p.value('res-monthly-payment') > 0);
        assert.ok(p.errors.some((message) => message.includes(logMessage)));
        assert.equal(p.run('window.__diagnosticCalls.length'), 1);
        assert.equal(p.run('window.__diagnosticCalls[0][2].mortgage_diagnostic.stage'), stage);
        assert.equal(p.run('window.__diagnosticCalls[0][2].mortgage_diagnostic.kind'), 'render_exception');
        assert.deepEqual(p.goals, []);
    }
});

test('financial failures remain separate from rendering failures and use neutral recovery copy', () => {
    const p = page();
    p.run('window.__diagnosticCalls = []; window.ym = (...args) => window.__diagnosticCalls.push(args)');
    p.run('simulateMortgage = () => { throw new Error("model failed"); }; updateCalculations()');
    assert.equal(p.transitions.at(-1), 'CALCULATION_IMPOSSIBLE');
    assert.equal(p.transitionDetails.at(-1).message, 'Расчёт временно не выполнен. Измените любой параметр и попробуйте снова.');
    assert.ok(p.errors.some((message) => message.includes('Mortgage financial calculation failed')));
    assert.doesNotMatch(p.transitionDetails.at(-1).message, /невозможно построить.*график/i);
    assert.equal(p.run('JSON.stringify(window.__diagnosticCalls[0])'), JSON.stringify([
        110360838,
        'params',
        { mortgage_diagnostic: { stage: 'simulation', kind: 'model_exception' } }
    ]));
});

test('mortgage diagnostics are defensive, categorical session params and never goals', () => {
    const helper = mortgage.slice(
        mortgage.indexOf('const mortgageDiagnosticStages'),
        mortgage.indexOf('// Capture calculator edits')
    );
    assert.match(helper, /window\.ym\(110360838, 'params'/);
    assert.doesNotMatch(helper, /reachGoal|exception\.message|error\.message|stack|location|href/);

    const p = page();
    assert.doesNotThrow(() => p.run("reportMortgageDiagnostic('simulation', 'model_exception')"));
    p.run('window.__diagnosticCalls = []; window.ym = (...args) => window.__diagnosticCalls.push(args)');
    p.run("reportMortgageDiagnostic('chart_render', 'dependency_unavailable'); reportMortgageDiagnostic('chart_render', 'dependency_unavailable'); reportMortgageDiagnostic('unknown_stage', 'render_exception')");
    assert.equal(p.run('window.__diagnosticCalls.length'), 1);
    assert.equal(p.run('window.__diagnosticCalls[0][0]'), 110360838);
    assert.equal(p.run('window.__diagnosticCalls[0][1]'), 'params');
    assert.equal(p.run('Object.keys(window.__diagnosticCalls[0][2]).join()'), 'mortgage_diagnostic');
    assert.equal(p.run('Object.keys(window.__diagnosticCalls[0][2].mortgage_diagnostic).sort().join()'), 'kind,stage');
    assert.equal(p.run('window.__diagnosticCalls[0][2].mortgage_diagnostic.stage'), 'chart_render');
    assert.equal(p.run('window.__diagnosticCalls[0][2].mortgage_diagnostic.kind'), 'dependency_unavailable');
    assert.doesNotThrow(() => p.run("window.ym = () => { throw new Error('collector failed') }; reportMortgageDiagnostic('history_render', 'render_exception')"));
});

test('Chart.js unavailable or throwing degrades charts without destroying the primary result', () => {
    for (const [chartSetup, expectedKind] of [
        ['', 'dependency_unavailable'],
        ['Chart = function() { throw new Error("chart failed"); }', 'render_exception']
    ]) {
        const p = page({ withCanvases: true, stubChart: false });
        p.run('window.__diagnosticCalls = []; window.ym = (...args) => window.__diagnosticCalls.push(args)');
        if (chartSetup) p.run(chartSetup);
        p.edit();
        p.run('updateCalculations()');
        assert.equal(p.transitions.at(-1), 'READY');
        assert.equal(p.value('res-loan-amount'), 8000000);
        assert.ok(p.value('res-monthly-payment') > 0);
        assert.equal(p.run('window.__diagnosticCalls.length'), 1);
        assert.equal(p.run('window.__diagnosticCalls[0][2].mortgage_diagnostic.stage'), 'chart_render');
        assert.equal(p.run('window.__diagnosticCalls[0][2].mortgage_diagnostic.kind'), expectedKind);
        assert.deepEqual(p.goals, ['calculate_success']);
    }
});

test('available Chart.js receives finite donut and balance-series data', () => {
    const p = page({ withCanvases: true, stubChart: false });
    p.run(`
        window.__chartConfigs = [];
        Chart = function(target, config) {
            window.__chartConfigs.push(config);
            this.destroy = () => {};
        };
        updateCalculations();
    `);
    assert.equal(p.transitions.at(-1), 'READY');
    assert.equal(p.run('window.__chartConfigs.length'), 2);
    assert.equal(p.run('window.__chartConfigs[0].type'), 'doughnut');
    assert.equal(p.run('window.__chartConfigs[0].data.datasets[0].data.every(Number.isFinite)'), true);
    assert.equal(p.run('window.__chartConfigs[1].type'), 'line');
    assert.equal(p.run('window.__chartConfigs[1].data.datasets.every(dataset => dataset.data.every(Number.isFinite))'), true);
});

test('a primary DOM failure is diagnostic-only and does not become a financial error', () => {
    const p = page();
    p.run('updateCalculations()');
    assert.equal(p.transitions.at(-1), 'READY');
    assert.equal(p.value('res-loan-amount'), 8000000);

    p.run(`
        window.__diagnosticCalls = [];
        window.ym = (...args) => window.__diagnosticCalls.push(args);
        window.__getElementById = document.getElementById;
        document.getElementById = (id) => {
            if (id === 'res-loan-amount') throw new Error('primary render failed');
            return window.__getElementById(id);
        };
        state.cost = 13000000;
        updateCalculations();
    `);
    assert.equal(p.transitions.at(-1), 'READY');
    assert.equal(p.value('res-loan-amount'), 8000000);
    assert.equal(p.run('window.__diagnosticCalls[0][2].mortgage_diagnostic.stage'), 'primary_render');
    assert.equal(p.run('window.__diagnosticCalls[0][2].mortgage_diagnostic.kind'), 'render_exception');
    assert.ok(p.errors.some((message) => message.includes('Mortgage primary result rendering failed')));
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

test('term mode stays finite and ready across the paid-traffic boundary matrix', () => {
    const p = page();
    const outcome = p.run(`(() => {
        const costs = [1000000, 4500000, 7500000, 13000000, 30000000, 43000000, 50000000];
        const rates = [0.1, 14, 16, 23.8, 35, 50];
        const terms = [1, 5, 20, 25, 34, 50];
        const failures = [];
        let checked = 0;
        state.mode = 'term';
        state.recurringPrepayment = 0;
        state.customPrepayments = {};
        for (const cost of costs) {
            const downPayments = [0, cost * 0.15, cost * 0.2, cost * 0.3, cost * 0.9, cost - 50000];
            for (const downPayment of downPayments) {
                for (const rate of rates) {
                    for (const termYears of terms) {
                        state.cost = cost;
                        state.downPayment = Math.round(downPayment);
                        state.rate = rate;
                        state.termYears = termYears;
                        updateCalculations();
                        const result = simulateMortgage(true);
                        const last = result.schedule.at(-1);
                        checked++;
                        if (mortgageStateController.getState() !== CalculatorState.STATES.READY
                            || !Number.isFinite(result.totalInterest)
                            || !Number.isFinite(result.totalPaid)
                            || !last || !Number.isFinite(last.balance) || last.balance > 0.01
                            || result.schedule.some(month => ![month.payment, month.interest, month.principal, month.balance].every(Number.isFinite))) {
                            failures.push({ cost, downPayment, rate, termYears, state: mortgageStateController.getState(), lastBalance: last && last.balance });
                        }
                    }
                }
            }
        }
        return { checked, failures };
    })()`);
    assert.equal(outcome.checked, 1512);
    assert.equal(outcome.failures.length, 0, JSON.stringify(outcome.failures));
});

test('valid payment mode remains finite across representative costs and rates', () => {
    const p = page();
    const outcome = p.run(`(() => {
        const costs = [1000000, 4500000, 7500000, 13000000, 30000000, 43000000, 50000000];
        const rates = [0.1, 14, 16, 23.8, 35, 50];
        const failures = [];
        let checked = 0;
        state.mode = 'payment';
        state.recurringPrepayment = 0;
        state.customPrepayments = {};
        for (const cost of costs) {
            for (const rate of rates) {
                state.cost = cost;
                state.downPayment = Math.round(cost * 0.2);
                state.rate = rate;
                const balance = state.cost - state.downPayment;
                const monthlyRate = rate / 1200;
                const months = 20 * 12;
                const annuity = monthlyRate === 0
                    ? balance / months
                    : balance * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
                state.targetPayment = annuity * 1.05;
                updateCalculations();
                const result = simulateMortgage(true);
                const last = result.schedule.at(-1);
                checked++;
                if (mortgageStateController.getState() !== CalculatorState.STATES.READY
                    || !last || last.balance > 0.01
                    || result.schedule.some(month => ![month.payment, month.interest, month.principal, month.balance].every(Number.isFinite))) {
                    failures.push({ cost, rate, state: mortgageStateController.getState(), lastBalance: last && last.balance });
                }
            }
        }
        return { checked, failures };
    })()`);
    assert.equal(outcome.checked, 42);
    assert.equal(outcome.failures.length, 0, JSON.stringify(outcome.failures));
});

test('payment mode rejects schedules beyond the supported 50-year horizon and recovers', () => {
    const p = page();
    p.run("state.mode = 'payment'; state.cost = 50000000; state.downPayment = 10000000; state.rate = 0.1; state.targetPayment = 3334; updateCalculations()");
    assert.equal(p.transitions.at(-1), 'INVALID_INPUT');
    assert.match(p.transitionDetails.at(-1).message, /превысит 50 лет/);

    p.run('state.targetPayment = minimumPaymentForMonths(state.cost - state.downPayment, state.rate, 240); updateCalculations()');
    assert.equal(p.transitions.at(-1), 'READY');
    const result = p.run('simulateMortgage(true)');
    assert.ok(result.schedule.length <= 240);
    assert.ok(result.schedule.at(-1).balance <= 0.01);
});

test('valid inputs recover after invalid and extreme states, including the Family preset', () => {
    const p = page();
    p.run('updateCalculations()');
    assert.equal(p.transitions.at(-1), 'READY');

    p.run('state.cost = 43000000; state.downPayment = 43000000; state.rate = 23.8; state.termYears = 34; updateCalculations()');
    assert.equal(p.transitions.at(-1), 'INVALID_INPUT');

    p.run("applyFlatPreset('family')");
    assert.equal(p.transitions.at(-1), 'READY');
    assert.equal(p.value('res-loan-amount'), 10400000);

    p.run('state.cost = 50000000; state.downPayment = 45000000; state.rate = 50; state.termYears = 50; updateCalculations()');
    assert.equal(p.transitions.at(-1), 'READY');

    p.run('state.downPayment = state.cost; updateCalculations()');
    assert.equal(p.transitions.at(-1), 'INVALID_INPUT');
    p.run('state.downPayment = 15000000; state.rate = 35; state.termYears = 25; updateCalculations()');
    assert.equal(p.transitions.at(-1), 'READY');

    p.run('for (let i = 0; i < 25; i++) updateCalculations()');
    assert.equal(p.transitions.at(-1), 'READY');
    assert.ok(!/NaN|Infinity/.test(p.element('res-total-interest').innerText));
});

test('all mortgage money-entry text inputs request a numeric keyboard', () => {
    const inputTags = [...mortgage.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
    for (const id of [
        'cost-input', 'downpayment-input', 'payment-input', 'recurring-input',
        'active-payment-input', 'active-amount-input', 'active-balance-input'
    ]) {
        const tag = inputTags.find((input) => input.includes(`id="${id}"`));
        assert.ok(tag, `${id} must exist`);
        assert.match(tag, /inputmode="numeric"/, `${id} must request a numeric keyboard`);
    }
    const customPrepayment = inputTags.find((input) => input.includes('aria-label="Досрочный платёж за месяц'));
    assert.ok(customPrepayment, 'custom prepayment input template must exist');
    assert.match(customPrepayment, /inputmode="numeric"/);
});

test('mobile core sliders stay hidden and sticky summary follows keyboard viewport geometry', () => {
    for (const id of ['cost-range', 'downpayment-range', 'rate-range', 'term-range', 'payment-range', 'active-balance-range']) {
        assert.match(mortgage, new RegExp(`#${id}[\\s\\S]*?display: none !important;`));
    }
    assert.match(mortgage, /body\.mortgage-keyboard-open \.mobile-sticky-results\s*{\s*display: none !important;/);
    assert.doesNotMatch(mortgage, /body\.mortgage-input-focused \.mobile-sticky-results/);
    assert.match(mortgage, /scroll-margin-bottom: calc\(11rem \+ env\(safe-area-inset-bottom\)\)/);

    const p = page();
    p.run('state.cost = 43000000; state.downPayment = 12900000; state.rate = 23.8; state.termYears = 34; updateInputsDOM(); updateCalculations()');
    assert.equal(p.element('cost-range').value, 43000000);
    assert.equal(p.element('downpayment-range').value, 12900000);
    assert.equal(p.transitions.at(-1), 'READY');

    p.focusInput();
    assert.equal(p.bodyClasses.has('mortgage-keyboard-open'), false);
    assert.equal(p.scrollCalls.at(-1).block, 'center');
    assert.equal(p.scrollCalls.at(-1).inline, 'nearest');
    assert.equal(p.scrollCalls.at(-1).behavior, 'smooth');

    p.resizeViewport(500);
    assert.equal(p.bodyClasses.has('mortgage-keyboard-open'), true);
    p.focusInput(1);
    assert.equal(p.bodyClasses.has('mortgage-keyboard-open'), true);

    p.resizeViewport(844);
    assert.equal(p.hasFocusedInput(), true);
    assert.equal(p.bodyClasses.has('mortgage-keyboard-open'), false);

    p.resizeViewport(500);
    assert.equal(p.bodyClasses.has('mortgage-keyboard-open'), true);
    p.blurInput();
    assert.equal(p.bodyClasses.has('mortgage-keyboard-open'), false);

    p.resizeViewport(844);
    assert.equal(p.bodyClasses.has('mortgage-keyboard-open'), false);

    const fallback = page({ withVisualViewport: false });
    fallback.focusInput();
    fallback.resizeWindow(500);
    assert.equal(fallback.bodyClasses.has('mortgage-keyboard-open'), true);
    fallback.resizeWindow(844);
    assert.equal(fallback.hasFocusedInput(), true);
    assert.equal(fallback.bodyClasses.has('mortgage-keyboard-open'), false);

    const desktop = page({ mobile: false });
    desktop.focusInput();
    desktop.resizeViewport(500);
    assert.equal(desktop.bodyClasses.has('mortgage-keyboard-open'), false);
});

test('payment mode seeds the current term payment until the user explicitly edits it', () => {
    const fresh = page();
    fresh.run('updateCalculations()');
    const displayedTermPayment = fresh.value('res-monthly-payment');
    fresh.run("switchCalculationMode('payment')");
    assert.equal(fresh.transitions.at(-1), 'READY');
    assert.ok(Math.abs(fresh.run('state.targetPayment') - displayedTermPayment) <= 1);
    assert.equal(Number(String(fresh.element('payment-input').value).replace(/\D/g, '')), fresh.run('state.targetPayment'));
    assert.equal(Number(fresh.element('payment-range').value), fresh.run('state.targetPayment'));

    const changed = page();
    changed.run('state.cost = 13000000; state.downPayment = 2600000; state.rate = 14; state.termYears = 25; updateInputsDOM(); updateCalculations()');
    const changedTermPayment = changed.value('res-monthly-payment');
    changed.run("switchCalculationMode('payment')");
    assert.equal(changed.transitions.at(-1), 'READY');
    assert.ok(Math.abs(changed.run('state.targetPayment') - changedTermPayment) <= 1);

    changed.run(`(() => {
        const input = document.getElementById('payment-input');
        input.value = '150 000';
        input.selectionStart = input.value.length;
        handleTargetPaymentInput(input);
    })()`);
    assert.equal(changed.run('state.targetPayment'), 150000);
    changed.run("switchCalculationMode('term'); switchCalculationMode('payment')");
    assert.equal(changed.run('state.targetPayment'), 150000);
    assert.equal(changed.transitions.at(-1), 'READY');

    changed.run(`(() => {
        const input = document.getElementById('payment-input');
        input.value = '100 000';
        input.selectionStart = input.value.length;
        handleTargetPaymentInput(input);
    })()`);
    assert.equal(changed.transitions.at(-1), 'INVALID_INPUT');
    assert.match(changed.transitionDetails.at(-1).message, /не покрывает ежемесячные проценты/);

    changed.run("resetAll(); switchCalculationMode('payment')");
    assert.equal(changed.run('targetPaymentWasEdited'), false);
    assert.equal(changed.transitions.at(-1), 'READY');
    assert.notEqual(changed.run('state.targetPayment'), 100000);

    const highPayment = page();
    highPayment.run('state.cost = 50000000; state.downPayment = 0; state.rate = 50; state.termYears = 1; updateInputsDOM(); switchCalculationMode("payment")');
    assert.equal(highPayment.transitions.at(-1), 'READY');
    assert.ok(Number(highPayment.element('payment-range').max) >= highPayment.run('state.targetPayment'));

    const fiftyYears = page();
    fiftyYears.run('state.cost = 1000000; state.downPayment = 0; state.rate = 0.1; state.termYears = 50; updateInputsDOM(); switchCalculationMode("payment")');
    assert.equal(fiftyYears.transitions.at(-1), 'READY');
    assert.ok(fiftyYears.run('simulateMortgage(true).schedule.length') <= 600);
});
