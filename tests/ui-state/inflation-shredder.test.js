const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { containsTechnicalValue } = require('../../js/calculator-state.js');
const { calculateInflationImpact } = require('../../js/inflation-calculator.js');
const {
    fetchInflation,
    getInflationRecords,
    getInflationStatusMessage,
    normalizeInflationData
} = require('../../js/api.js');

function repositoryInflation() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'inflation.json'), 'utf8'));
}

test('schema v2 normalization exposes the complete official annual series', () => {
    const dataset = normalizeInflationData(repositoryInflation());
    const records = getInflationRecords(dataset);

    assert.equal(dataset.metadata.schema_version, 2);
    assert.equal(records.length, 26);
    assert.equal(records[0].year, 2000);
    assert.equal(records.at(-1).year, dataset.metadata.data_through);
    assert.equal(records.every((record, index) => index === 0 || record.year === records[index - 1].year + 1), true);
});

test('default shredder period produces a finite non-zero inflation impact', () => {
    const records = getInflationRecords(repositoryInflation());
    const result = calculateInflationImpact(records, 2016, 1000);
    const expectedFactor = records
        .filter((record) => record.year >= 2016)
        .reduce((factor, record) => factor * (1 + record.inflation_percent / 100), 1);

    assert.equal(result.startYear, 2016);
    assert.equal(result.endYear, 2025);
    assert.equal(result.yearly.length, 10);
    assert.ok(result.cumulativePercent > 0);
    assert.ok(result.equivalentAmount > 1000);
    assert.ok(result.remainingValue < 1000);
    assert.ok(Math.abs(result.cumulativeFactor - expectedFactor) < 1e-12);
    assert.ok(result.yearly.at(-1).purchasingPowerOf1000 < result.yearly[0].purchasingPowerOf1000);
    assert.equal(containsTechnicalValue(result), false);
});

test('every selectable official year produces a complete finite series', () => {
    const records = getInflationRecords(repositoryInflation());

    for (const record of records) {
        const result = calculateInflationImpact(records, record.year, 125000);
        assert.equal(result.startYear, record.year);
        assert.equal(result.endYear, records.at(-1).year);
        assert.equal(result.yearly.length, records.at(-1).year - record.year + 1);
        assert.equal(containsTechnicalValue(result), false);
    }
});

test('impossible input and incomplete series fail closed', () => {
    const records = getInflationRecords(repositoryInflation());

    assert.throws(() => calculateInflationImpact(records, 2016, 0), /Invalid inflation calculation input/);
    assert.throws(() => calculateInflationImpact(records, 1999, 1000), /Selected year is unavailable/);
    assert.throws(
        () => calculateInflationImpact(records.filter((record) => record.year !== 2020), 2016, 1000),
        /Invalid inflation series/
    );
});

test('legacy, incomplete and unofficial inflation payloads are rejected', () => {
    assert.throws(() => normalizeInflationData({ 2025: 5.59 }), /Unsupported inflation schema/);

    const incomplete = repositoryInflation();
    incomplete.annual.splice(3, 1);
    assert.throws(() => normalizeInflationData(incomplete), /unique and consecutive/);

    const technical = repositoryInflation();
    technical.annual[0].inflation_percent = null;
    technical.annual[0].cpi_index = 100;
    assert.throws(() => normalizeInflationData(technical), /Invalid inflation record/);

    const unofficial = repositoryInflation();
    unofficial.metadata.source_url = 'https://example.com/inflation';
    assert.throws(() => normalizeInflationData(unofficial), /Unsupported inflation source/);
});

test('inflation fetch fails closed when the response is not schema v2', async (context) => {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    context.after(() => {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
    });
    global.fetch = async () => ({ ok: true, json: async () => ({ 2025: 5.59 }) });
    console.error = () => {};

    assert.equal(await fetchInflation(), null);
});

test('stale remains usable with disclosure while unavailable contains no calculation data', () => {
    const stale = repositoryInflation();
    stale.metadata.status = 'stale';
    stale.metadata.status_reason = 'fetch_failed';
    assert.equal(getInflationRecords(stale).length, 26);
    assert.match(getInflationStatusMessage(stale), /последние доступные официальные данные/);

    const unavailable = repositoryInflation();
    unavailable.metadata.status = 'unavailable';
    unavailable.metadata.status_reason = 'freshness_exceeded';
    unavailable.metadata.data_through = null;
    unavailable.metadata.source_export_url = null;
    unavailable.metadata.source_checksum_sha256 = null;
    unavailable.metadata.source_published_at = null;
    unavailable.metadata.last_successful_fetch_at = null;
    unavailable.annual = [];

    assert.deepEqual(getInflationRecords(unavailable), []);
    assert.match(getInflationStatusMessage(unavailable), /Расчёт не выполнен/);
});

test('production page wiring uses the shared state controller and cached model assets', () => {
    const root = path.join(__dirname, '..', '..');
    const html = fs.readFileSync(path.join(root, 'inflation-shredder.html'), 'utf8');
    const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

    assert.match(html, /js\/calculator-state\.js/);
    assert.match(html, /js\/inflation-calculator\.js/);
    assert.match(html, /shredderStateController\.runCalculation/);
    assert.doesNotMatch(html, /Object\.values\(inflationData\)/);
    assert.doesNotMatch(html, /Данные обновлены/);
    assert.doesNotMatch(html, />0%<|>0 ₽</);
    assert.match(serviceWorker, /\/js\/calculator-state\.js/);
    assert.match(serviceWorker, /\/js\/inflation-calculator\.js/);
});
