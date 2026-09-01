'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseJsonStrict, validateDataset } = require('../../data_validation/validate');
const { buildRatesData, parseControlRateHtml, parseKeyRateXml, updateRates } = require('../../update_rates');
const { updateInflation } = require('../../update_inflation');

const NOW = new Date('2026-09-01T06:00:00.000Z');

function officialRate(valuePercent = 14) {
    return {
        valuePercent,
        effectiveFrom: '2026-07-27',
        sourceChecksum: 'a'.repeat(64)
    };
}

function officialInflation() {
    const current = parseJsonStrict(fs.readFileSync(path.join(__dirname, '..', '..', 'inflation.json'), 'utf8'));
    return {
        exportUrl: current.metadata.source_export_url,
        sourcePublishedAt: current.metadata.source_published_at,
        checksum: current.metadata.source_checksum_sha256,
        annual: current.annual
    };
}

test('CBR parsers require usable and internally consistent source data', () => {
    const xml = '<KR><DT>2026-07-27T00:00:00</DT><Rate>14,00</Rate></KR>';
    assert.deepEqual(parseKeyRateXml(xml), { valuePercent: 14, effectiveFrom: '2026-07-27' });
    assert.equal(parseControlRateHtml('<table><tr><td>31.08.2026</td><td>14,00</td></tr></table>'), 14);

    const conflicting = `${xml}<KR><DT>2026-07-27T00:00:00</DT><Rate>15,00</Rate></KR>`;
    assert.throws(() => parseKeyRateXml(conflicting), { code: 'semantic_validation_failed' });
});

test('rates updater publishes a validated schema v2 candidate atomically', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calchub-rates-'));
    const outputPath = path.join(directory, 'rates.json');
    try {
        const result = await updateRates({
            ratesPath: outputPath,
            now: NOW,
            loader: async () => officialRate()
        });
        assert.equal(result.metadata.status, 'ok');
        assert.equal(result.cb_rate, 14);
        validateDataset('rates', parseJsonStrict(fs.readFileSync(outputPath, 'utf8')), { now: NOW });
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('invalid rate candidate is fail-closed and never published as a number', async () => {
    const result = await buildRatesData({
        previousData: null,
        now: NOW,
        loader: async () => officialRate(140)
    });
    assert.equal(result.metadata.status, 'unavailable');
    assert.equal(result.cb_rate, null);
});

test('network failure without a trusted rate snapshot publishes unavailable', async () => {
    const result = await buildRatesData({
        previousData: null,
        now: NOW,
        loader: async () => {
            throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
        }
    });
    assert.equal(result.metadata.status, 'unavailable');
    assert.equal(result.metadata.status_reason, 'no_saved_dataset');
    assert.equal(result.key_rate, null);
});

test('inflation updater keeps the last valid complete row on validation failure', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calchub-inflation-'));
    const outputPath = path.join(directory, 'inflation.json');
    try {
        const first = await updateInflation({
            outputPath,
            now: NOW,
            loader: async () => officialInflation()
        });
        assert.equal(first.metadata.status, 'ok');

        const bad = officialInflation();
        bad.annual = bad.annual.map((record) => ({ ...record }));
        bad.annual[0].inflation_percent += 1;
        const secondNow = new Date('2026-09-02T06:00:00.000Z');
        const second = await updateInflation({
            outputPath,
            now: secondNow,
            loader: async () => bad
        });
        assert.equal(second.metadata.status, 'stale');
        assert.deepEqual(second.annual, first.annual);
        assert.equal(second.metadata.last_successful_fetch_at, first.metadata.last_successful_fetch_at);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('unchanged inflation source still transitions through stale to unavailable by freshness policy', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calchub-inflation-freshness-'));
    const outputPath = path.join(directory, 'inflation.json');
    try {
        const first = await updateInflation({
            outputPath,
            now: NOW,
            loader: async () => officialInflation()
        });
        assert.equal(first.metadata.status, 'ok');

        const stale = await updateInflation({
            outputPath,
            now: new Date('2027-02-15T00:00:00.000Z'),
            loader: async () => officialInflation()
        });
        assert.equal(stale.metadata.status, 'stale');
        assert.equal(stale.metadata.status_reason, 'freshness_exceeded');
        assert.deepEqual(stale.annual, first.annual);

        const unavailable = await updateInflation({
            outputPath,
            now: new Date('2027-05-05T00:00:00.000Z'),
            loader: async () => officialInflation()
        });
        assert.equal(unavailable.metadata.status, 'unavailable');
        assert.deepEqual(unavailable.annual, []);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
