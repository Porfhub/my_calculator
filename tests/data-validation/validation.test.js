'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    DataValidationError,
    atomicWriteJson,
    buildFailureState,
    parseJsonStrict,
    payloadChecksum,
    unavailableDataset,
    validateDataset
} = require('../../data_validation/validate');

const NOW = new Date('2026-09-01T06:00:00.000Z');

function validRates(overrides = {}) {
    const keyRate = overrides.keyRate || { value_percent: 14, effective_from: '2026-07-27' };
    const fetchedAt = overrides.fetchedAt || '2026-09-01T05:00:00.000Z';
    const status = overrides.status || 'ok';
    const statusReason = status === 'ok' ? null : (overrides.statusReason || 'fetch_failed');
    return {
        metadata: {
            schema_version: 2,
            dataset_id: 'key_rate',
            status,
            status_reason: statusReason,
            source_name: 'Банк России',
            source_url: 'https://www.cbr.ru/hd_base/keyrate/',
            source_export_url: 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx',
            source_checksum_sha256: 'a'.repeat(64),
            payload_checksum_sha256: payloadChecksum(keyRate),
            source_published_at: null,
            sources: null,
            last_successful_fetch_at: fetchedAt,
            last_attempt_at: overrides.lastAttemptAt || '2026-09-01T06:00:00.000Z'
        },
        key_rate: keyRate,
        cb_rate: keyRate.value_percent,
        source_url: 'https://www.cbr.ru/hd_base/keyrate/',
        effective_from: keyRate.effective_from,
        fetched_at: fetchedAt,
        status
    };
}

function inflationFixture() {
    return parseJsonStrict(fs.readFileSync(path.join(__dirname, '..', '..', 'inflation.json'), 'utf8'));
}

test('strict parser rejects duplicate object keys', () => {
    assert.throws(
        () => parseJsonStrict('{"status":"ok","status":"stale"}'),
        (error) => error instanceof DataValidationError && error.stage === 'syntax'
    );
});

test('schema rejects missing and unknown fields', () => {
    const missing = validRates();
    delete missing.metadata.dataset_id;
    assert.throws(() => validateDataset('rates', missing, { now: NOW }), { reason: 'schema_validation_failed' });

    const unknown = validRates();
    unknown.synthetic_rate = 17;
    assert.throws(() => validateDataset('rates', unknown, { now: NOW }), { reason: 'schema_validation_failed' });
});

test('rates semantic validation checks checksum and compatibility projection', () => {
    const badChecksum = validRates();
    badChecksum.metadata.payload_checksum_sha256 = 'b'.repeat(64);
    assert.throws(() => validateDataset('rates', badChecksum, { now: NOW }), { reason: 'semantic_validation_failed' });

    const divergentProjection = validRates();
    divergentProjection.cb_rate = 13;
    assert.throws(() => validateDataset('rates', divergentProjection, { now: NOW }), { reason: 'semantic_validation_failed' });
});

test('rate freshness enforces soft and hard TTL', () => {
    validateDataset('rates', validRates(), { now: NOW });

    const fourDaysAgo = new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const stale = validRates({
        fetchedAt: fourDaysAgo,
        status: 'stale',
        statusReason: 'fetch_failed'
    });
    validateDataset('rates', stale, { now: NOW });

    const wronglyOk = validRates({ fetchedAt: fourDaysAgo });
    assert.throws(() => validateDataset('rates', wronglyOk, { now: NOW }), { reason: 'freshness_exceeded' });

    const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const expired = validRates({ fetchedAt: eightDaysAgo, status: 'stale' });
    assert.throws(() => validateDataset('rates', expired, { now: NOW }), { reason: 'freshness_exceeded' });
});

test('failure state preserves only a valid snapshot inside hard TTL', () => {
    const recent = validRates();
    const stale = buildFailureState('rates', recent, 'timeout', NOW);
    assert.equal(stale.metadata.status, 'stale');
    assert.deepEqual(stale.key_rate, recent.key_rate);
    assert.equal(stale.metadata.last_successful_fetch_at, recent.metadata.last_successful_fetch_at);

    const expiredAt = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const unavailable = buildFailureState('rates', validRates({ fetchedAt: expiredAt }), 'timeout', NOW);
    assert.equal(unavailable.metadata.status, 'unavailable');
    assert.equal(unavailable.key_rate, null);
    assert.equal(unavailable.cb_rate, null);
});

test('rate anomaly threshold quarantines a large official jump', () => {
    const previous = validRates();
    const keyRate = { value_percent: 20, effective_from: '2026-09-01' };
    const candidate = validRates({ keyRate });
    assert.throws(
        () => validateDataset('rates', candidate, { now: NOW, previous }),
        { reason: 'jump_requires_review' }
    );
});

test('inflation schema and semantic invariants accept the repository snapshot', () => {
    validateDataset('inflation', inflationFixture(), { now: NOW });
});

test('inflation rejects gaps, inconsistent CPI, and historical revisions', () => {
    const gap = inflationFixture();
    gap.annual.splice(5, 1);
    assert.throws(() => validateDataset('inflation', gap, { now: NOW }), { reason: 'partial_dataset' });

    const mismatch = inflationFixture();
    mismatch.annual[0].inflation_percent += 1;
    assert.throws(() => validateDataset('inflation', mismatch, { now: NOW }), { reason: 'semantic_validation_failed' });

    const previous = inflationFixture();
    const revision = inflationFixture();
    revision.annual[0].cpi_index += 0.6;
    revision.annual[0].inflation_percent += 0.6;
    assert.throws(
        () => validateDataset('inflation', revision, { now: NOW, previous }),
        { reason: 'jump_requires_review' }
    );
});

test('inflation freshness follows publication grace and hard TTL', () => {
    const afterDeadline = new Date('2027-02-15T00:00:00.000Z');
    const wronglyOk = inflationFixture();
    wronglyOk.metadata.last_attempt_at = afterDeadline.toISOString();
    assert.throws(
        () => validateDataset('inflation', wronglyOk, { now: afterDeadline }),
        { reason: 'freshness_exceeded' }
    );

    const stale = inflationFixture();
    stale.metadata.status = 'stale';
    stale.metadata.status_reason = 'fetch_failed';
    stale.metadata.last_attempt_at = afterDeadline.toISOString();
    validateDataset('inflation', stale, { now: afterDeadline });

    const afterHardTtl = new Date('2027-05-05T00:00:00.000Z');
    stale.metadata.last_attempt_at = afterHardTtl.toISOString();
    assert.throws(
        () => validateDataset('inflation', stale, { now: afterHardTtl }),
        { reason: 'freshness_exceeded' }
    );

    const unavailable = buildFailureState('inflation', stale, 'fetch_failed', afterHardTtl);
    assert.equal(unavailable.metadata.status, 'unavailable');
    assert.equal(unavailable.metadata.status_reason, 'freshness_exceeded');
    assert.deepEqual(unavailable.annual, []);
});

test('stale inflation cannot mutate the last verified payload', () => {
    const previous = inflationFixture();
    const stale = inflationFixture();
    stale.metadata.status = 'stale';
    stale.metadata.status_reason = 'fetch_failed';
    stale.metadata.last_attempt_at = NOW.toISOString();
    stale.annual[1].cpi_index += 0.1;
    stale.annual[1].inflation_percent += 0.1;
    assert.throws(
        () => validateDataset('inflation', stale, { now: NOW, previous }),
        { reason: 'semantic_validation_failed' }
    );
});

test('official provenance dates and host allowlists are enforced', () => {
    const badHost = inflationFixture();
    badHost.metadata.source_export_url = 'https://example.com/inflation.xlsx';
    assert.throws(() => validateDataset('inflation', badHost, { now: NOW }), { reason: 'semantic_validation_failed' });

    const futurePublication = inflationFixture();
    futurePublication.metadata.source_published_at = '2026-09-02';
    assert.throws(() => validateDataset('inflation', futurePublication, { now: NOW }), { reason: 'semantic_validation_failed' });
});

test('unavailable datasets contain no invented financial payload', () => {
    const rates = unavailableDataset('rates', NOW);
    const inflation = unavailableDataset('inflation', NOW);
    validateDataset('rates', rates, { now: NOW });
    validateDataset('inflation', inflation, { now: NOW });
    assert.equal(rates.cb_rate, null);
    assert.deepEqual(inflation.annual, []);
});

test('atomic write validates before replace and leaves no temporary file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calchub-validation-'));
    const outputPath = path.join(directory, 'rates.json');
    try {
        const valid = validRates();
        atomicWriteJson('rates', outputPath, valid, { now: NOW });
        const saved = fs.readFileSync(outputPath, 'utf8');

        const invalid = validRates();
        invalid.cb_rate = 99;
        assert.throws(() => atomicWriteJson('rates', outputPath, invalid, { now: NOW }));
        assert.equal(fs.readFileSync(outputPath, 'utf8'), saved);
        assert.deepEqual(fs.readdirSync(directory), ['rates.json']);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
