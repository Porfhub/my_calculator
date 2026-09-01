const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const affectedPages = [
    'financial-freedom.html',
    'millionaire.html',
    'genetic-wealth.html'
];

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

test('all affected calculators use fail-closed state and combined data lifecycle', () => {
    for (const file of affectedPages) {
        const html = read(file);

        assert.match(html, /js\/calculator-state\.js/, file);
        assert.match(html, /StateController\.runCalculation/, file);
        assert.match(html, /getCombinedDatasetStatus/, file);
        assert.match(html, /dataUnavailableMessage:\s*['"][^'"]*Расчёт не выполнен/, file);
        assert.match(html, /dataStatus\s*=\s*lifecycleState/, file);
        assert.match(html, /getState\(\)\s*!==\s*CalculatorState\.STATES\.READY/, file);
        assert.doesNotMatch(html, /Данные(?: успешно)? обновлены/, file);
    }
});

test('inflation consumers never parse schema v2 as a flat object or define an inflation fallback', () => {
    for (const file of affectedPages) {
        const html = read(file);

        assert.match(html, /getAverageInflationRate\(inflationData\)/, file);
        assert.doesNotMatch(html, /Object\.values\(inflationData\)/, file);
        assert.doesNotMatch(html, /avgInflation:\s*0?\.\d+/, file);
    }
});

test('genetic wealth clears every result card and both charts on non-ready states', () => {
    const html = read('genetic-wealth.html');
    const resultIds = [
        'total-with-inflation',
        'total-without-inflation',
        'monthly-average-stat',
        'equiv-apartments',
        'equiv-cars',
        'mobile-total',
        'mobile-inflation-impact'
    ];

    for (const id of resultIds) assert.match(html, new RegExp(`['"]${id}['"]`));
    assert.match(html, /chartInstance\.destroy\(\)/);
    assert.match(html, /categoryChartInstance\.destroy\(\)/);
    assert.match(html, /onStateChange:\s*\(nextState\)/);
    assert.match(html, /element\.hidden\s*=\s*!hasResult/);
    assert.match(html, /state\.avgInflation\s*=\s*externalDataReady\s*\?\s*averageInflation\s*:\s*null/);
});

test('service worker cache is advanced for the shared runtime update', () => {
    assert.match(read('sw.js'), /fin-hub-cache-v4/);
});
