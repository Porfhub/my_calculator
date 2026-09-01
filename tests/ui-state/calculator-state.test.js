const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    STATES,
    containsTechnicalValue,
    createController,
    writeSafeText
} = require('../../js/calculator-state.js');
const {
    getAverageInflationRate,
    getCentralBankRate,
    getCombinedDatasetStatus,
    getDatasetStatus,
    isDatasetUsable
} = require('../../js/api.js');

function createHarness() {
    const root = { dataset: {} };
    const message = { hidden: true, textContent: '' };
    const primary = { textContent: 'старый результат' };
    const secondary = { textContent: 'ещё один результат' };
    let clearCount = 0;

    const controller = createController({
        root,
        messageElement: message,
        resultElements: [primary, secondary],
        onClear: () => { clearCount += 1; }
    });

    return { controller, message, primary, root, secondary, getClearCount: () => clearCount };
}

test('state contract exposes every required UI state', () => {
    assert.deepEqual(Object.values(STATES), [
        'LOADING',
        'READY',
        'INVALID_INPUT',
        'CALCULATION_IMPOSSIBLE',
        'DATA_UNAVAILABLE',
        'ERROR'
    ]);
});

test('invalid input clears every stale result before showing the error', () => {
    const harness = createHarness();
    let calculated = false;

    const outcome = harness.controller.runCalculation({
        input: { amount: -1 },
        data: {},
        validateInput: () => false,
        validateData: () => true,
        calculate: () => { calculated = true; },
        render: () => {}
    });

    assert.equal(outcome.state, STATES.INVALID_INPUT);
    assert.equal(calculated, false);
    assert.equal(harness.primary.textContent, '—');
    assert.equal(harness.secondary.textContent, '—');
    assert.equal(harness.message.hidden, false);
    assert.equal(harness.root.dataset.calculationState, STATES.INVALID_INPUT);
});

test('loading and unavailable data prevent calculation', () => {
    for (const testCase of [
        { isLoading: true, expected: STATES.LOADING },
        { isLoading: false, expected: STATES.DATA_UNAVAILABLE }
    ]) {
        const harness = createHarness();
        let calculations = 0;
        const outcome = harness.controller.runCalculation({
            isLoading: testCase.isLoading,
            input: {},
            data: null,
            validateInput: () => true,
            validateData: () => false,
            calculate: () => { calculations += 1; },
            render: () => {}
        });

        assert.equal(outcome.state, testCase.expected);
        assert.equal(calculations, 0);
        assert.equal(harness.primary.textContent, '—');
    }
});

test('NaN, Infinity and undefined results never reach render', () => {
    for (const result of [NaN, Infinity, undefined, { nested: [42, NaN] }]) {
        const harness = createHarness();
        let rendered = false;
        const outcome = harness.controller.runCalculation({
            input: {},
            data: {},
            validateInput: () => true,
            validateData: () => true,
            calculate: () => result,
            render: () => { rendered = true; }
        });

        assert.equal(outcome.state, STATES.CALCULATION_IMPOSSIBLE);
        assert.equal(rendered, false);
        assert.equal(harness.primary.textContent, '—');
    }
});

test('technical text written by a renderer is removed by the post-render guard', () => {
    const harness = createHarness();
    const outcome = harness.controller.runCalculation({
        input: {},
        data: {},
        validateInput: () => true,
        validateData: () => true,
        calculate: () => ({ amount: 10 }),
        render: () => { harness.primary.textContent = 'NaN ₽'; }
    });

    assert.equal(outcome.state, STATES.CALCULATION_IMPOSSIBLE);
    assert.equal(harness.primary.textContent, '—');
});

test('successful render keeps results and hides the state message', () => {
    const harness = createHarness();
    const outcome = harness.controller.runCalculation({
        input: {},
        data: {},
        validateInput: () => true,
        validateData: () => true,
        calculate: () => ({ amount: 1250 }),
        render: (result) => { harness.primary.textContent = `${result.amount} ₽`; }
    });

    assert.equal(outcome.state, STATES.READY);
    assert.equal(harness.primary.textContent, '1250 ₽');
    assert.equal(harness.message.hidden, true);
    assert.equal(harness.getClearCount(), 0);
});

test('unexpected calculation errors fail closed', () => {
    const harness = createHarness();
    const outcome = harness.controller.runCalculation({
        input: {},
        data: {},
        validateInput: () => true,
        validateData: () => true,
        calculate: () => { throw new Error('boom'); },
        render: () => {}
    });

    assert.equal(outcome.state, STATES.ERROR);
    assert.equal(harness.primary.textContent, '—');
    assert.match(harness.message.textContent, /Не удалось выполнить расчёт/);
});

test('safe DOM writer replaces technical values with a neutral placeholder', () => {
    const element = { textContent: '' };

    assert.equal(writeSafeText(element, 42), true);
    assert.equal(element.textContent, '42');
    assert.equal(writeSafeText(element, 'undefined ₽'), false);
    assert.equal(element.textContent, '—');
    assert.equal(containsTechnicalValue({ value: -Infinity }), true);
    assert.equal(containsTechnicalValue('не\u00a0число ₽'), true);
    assert.equal(containsTechnicalValue('∞ ₽'), true);
});

test('combined financial status fails closed and preserves stale disclosure', () => {
    const ok = { metadata: { status: 'ok' } };
    const stale = { metadata: { status: 'stale' } };
    const unavailable = { metadata: { status: 'unavailable' } };

    assert.equal(getCombinedDatasetStatus([ok, ok]), 'ok');
    assert.equal(getCombinedDatasetStatus([ok, stale]), 'stale');
    assert.equal(getCombinedDatasetStatus([stale, unavailable]), 'unavailable');
    assert.equal(getCombinedDatasetStatus([ok, null]), 'unavailable');
    assert.equal(getCombinedDatasetStatus([]), 'unavailable');
});

test('financial data helpers accept ok/stale datasets and reject unavailable payloads', () => {
    const rates = {
        metadata: { status: 'ok' },
        key_rate: { value_percent: 14 },
        cb_rate: 14
    };
    const inflation = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'inflation.json'), 'utf8'));
    inflation.metadata.status = 'stale';
    inflation.metadata.status_reason = 'fetch_failed';

    assert.equal(getCentralBankRate(rates), 14);
    assert.equal(getDatasetStatus(inflation), 'stale');
    assert.equal(isDatasetUsable(inflation), true);
    assert.equal(Number.isFinite(getAverageInflationRate(inflation)), true);
    assert.equal(getAverageInflationRate({ metadata: { status: 'unavailable' }, annual: [] }), null);
});

test('financial data helpers fail closed on malformed or technical values', () => {
    assert.equal(getCentralBankRate({ metadata: { status: 'ok' }, cb_rate: 'NaN' }), null);
    assert.equal(getCentralBankRate({ metadata: { status: 'unexpected' }, cb_rate: 14 }), null);
    assert.equal(getCentralBankRate({ metadata: { status: 'ok' }, status: 'unavailable', cb_rate: 14 }), null);
    assert.equal(getAverageInflationRate({
        metadata: { status: 'ok' },
        annual: [{ year: 2025, inflation_percent: undefined }]
    }), null);
    assert.equal(getAverageInflationRate({
        metadata: { status: 'ok' },
        annual: [{ year: 2025, inflation_percent: null }]
    }), null);
    assert.equal(getAverageInflationRate({
        metadata: { status: 'ok' },
        annual: [{ year: 2025, inflation_percent: -100 }]
    }), null);
});
