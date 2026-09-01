'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { DATASET_POLICIES, STATUS_REASONS, getPolicy } = require('./policies');

const COMMON_SCHEMA_PATH = path.join(__dirname, '..', 'schemas', 'common-metadata.schema.json');
const SUCCESS_STATUSES = new Set(['ok', 'stale']);
let compiledSchemas;

class DataValidationError extends Error {
    constructor(stage, reason, message, details = []) {
        super(message);
        this.name = 'DataValidationError';
        this.stage = stage;
        this.reason = reason;
        this.details = details;
    }
}

function parseJsonStrict(text, label = 'JSON') {
    let index = 0;

    function fail(message) {
        throw new DataValidationError('syntax', 'schema_validation_failed', `${label}: ${message} (позиция ${index})`);
    }

    function skipWhitespace() {
        while (/\s/.test(text[index] || '')) index += 1;
    }

    function parseString() {
        if (text[index] !== '"') fail('ожидалась строка');
        const start = index;
        index += 1;
        while (index < text.length) {
            const char = text[index];
            if (char === '"') {
                index += 1;
                try {
                    return JSON.parse(text.slice(start, index));
                } catch {
                    fail('некорректная строка');
                }
            }
            if (char === '\\') {
                index += 1;
                if (text[index] === 'u') {
                    if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) fail('некорректный Unicode escape');
                    index += 5;
                    continue;
                }
                if (!'"\\/bfnrt'.includes(text[index] || '')) fail('некорректный escape');
                index += 1;
                continue;
            }
            if (char.charCodeAt(0) < 0x20) fail('управляющий символ в строке');
            index += 1;
        }
        fail('незакрытая строка');
    }

    function parseNumber() {
        const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
        if (!match) fail('некорректное число');
        index += match[0].length;
        const value = Number(match[0]);
        if (!Number.isFinite(value)) fail('число должно быть конечным');
        return value;
    }

    function parseArray() {
        const result = [];
        index += 1;
        skipWhitespace();
        if (text[index] === ']') {
            index += 1;
            return result;
        }
        while (index < text.length) {
            result.push(parseValue());
            skipWhitespace();
            if (text[index] === ']') {
                index += 1;
                return result;
            }
            if (text[index] !== ',') fail('ожидалась запятая в массиве');
            index += 1;
            skipWhitespace();
        }
        fail('незакрытый массив');
    }

    function parseObject() {
        const result = {};
        const keys = new Set();
        index += 1;
        skipWhitespace();
        if (text[index] === '}') {
            index += 1;
            return result;
        }
        while (index < text.length) {
            const key = parseString();
            if (keys.has(key)) fail(`duplicate key "${key}"`);
            keys.add(key);
            skipWhitespace();
            if (text[index] !== ':') fail('ожидалось двоеточие');
            index += 1;
            result[key] = parseValue();
            skipWhitespace();
            if (text[index] === '}') {
                index += 1;
                return result;
            }
            if (text[index] !== ',') fail('ожидалась запятая в объекте');
            index += 1;
            skipWhitespace();
        }
        fail('незакрытый объект');
    }

    function parseValue() {
        skipWhitespace();
        const char = text[index];
        if (char === '{') return parseObject();
        if (char === '[') return parseArray();
        if (char === '"') return parseString();
        if (char === '-' || /\d/.test(char || '')) return parseNumber();
        for (const [literal, value] of [['true', true], ['false', false], ['null', null]]) {
            if (text.startsWith(literal, index)) {
                index += literal.length;
                return value;
            }
        }
        fail('неожиданное значение');
    }

    const result = parseValue();
    skipWhitespace();
    if (index !== text.length) fail('данные после завершения JSON');
    return result;
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function payloadChecksum(payload) {
    return sha256(stableStringify(payload));
}

function loadSchemas() {
    if (compiledSchemas) return compiledSchemas;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv, { mode: 'full' });
    const common = parseJsonStrict(fs.readFileSync(COMMON_SCHEMA_PATH, 'utf8'), COMMON_SCHEMA_PATH);
    ajv.addSchema(common);
    compiledSchemas = {};
    for (const [dataset, policy] of Object.entries(DATASET_POLICIES)) {
        const schema = parseJsonStrict(fs.readFileSync(policy.schemaPath, 'utf8'), policy.schemaPath);
        compiledSchemas[dataset] = ajv.compile(schema);
    }
    return compiledSchemas;
}

function validateSchema(dataset, value) {
    const validator = loadSchemas()[dataset];
    if (!validator) throw new DataValidationError('schema', 'schema_validation_failed', `Нет схемы для ${dataset}`);
    if (!validator(value)) {
        const details = validator.errors.map((error) => `${error.instancePath || '/'} ${error.message}`);
        throw new DataValidationError('schema', 'schema_validation_failed', `${dataset}: JSON Schema validation failed`, details);
    }
}

function parseDate(value, label) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', `${label}: некорректная дата`);
    }
    return timestamp;
}

function assertOfficialUrl(value, policy, label) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new DataValidationError('provenance', 'semantic_validation_failed', `${label}: некорректный URL`);
    }
    if (url.protocol !== 'https:' || !policy.sourceHosts.includes(url.hostname.toLowerCase())) {
        throw new DataValidationError('provenance', 'semantic_validation_failed', `${label}: источник не входит в allowlist`);
    }
}

function assertStatusMetadata(metadata, now, clockSkewMs) {
    if (metadata.status === 'ok' && metadata.status_reason !== null) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', 'ok требует status_reason=null');
    }
    if (metadata.status !== 'ok' && !STATUS_REASONS.has(metadata.status_reason)) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', `${metadata.status} требует разрешенный status_reason`);
    }
    if (metadata.last_successful_fetch_at && metadata.last_attempt_at) {
        if (parseDate(metadata.last_attempt_at, 'last_attempt_at') < parseDate(metadata.last_successful_fetch_at, 'last_successful_fetch_at')) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', 'last_attempt_at раньше last_successful_fetch_at');
        }
    }
    if (metadata.last_successful_fetch_at
        && parseDate(metadata.last_successful_fetch_at, 'last_successful_fetch_at') > now.getTime() + clockSkewMs) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', 'last_successful_fetch_at находится в будущем');
    }
    if (metadata.source_published_at && metadata.last_successful_fetch_at
        && parseDate(metadata.source_published_at, 'source_published_at')
            > parseDate(metadata.last_successful_fetch_at, 'last_successful_fetch_at')) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', 'source_published_at позже last_successful_fetch_at');
    }
}

function decimalPlaces(value) {
    const text = String(value).toLowerCase();
    if (text.includes('e-')) return Number(text.split('e-')[1]);
    return (text.split('.')[1] || '').length;
}

function validateRatesSemantic(value, options) {
    const policy = getPolicy('rates');
    const { metadata } = value;
    assertStatusMetadata(metadata, options.now, policy.clockSkewMs);
    assertOfficialUrl(metadata.source_url, policy, 'metadata.source_url');
    assertOfficialUrl(value.source_url, policy, 'source_url');

    if (metadata.status !== value.status) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', 'Compatibility status расходится с metadata.status');
    }

    if (SUCCESS_STATUSES.has(metadata.status)) {
        if (!value.key_rate || metadata.source_export_url === null || metadata.source_checksum_sha256 === null
            || metadata.payload_checksum_sha256 === null || metadata.last_successful_fetch_at === null) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', `${metadata.status}: отсутствует проверенный payload/provenance`);
        }
        assertOfficialUrl(metadata.source_export_url, policy, 'metadata.source_export_url');
        const rate = value.key_rate.value_percent;
        if (rate < policy.hardRange.min || rate > policy.hardRange.max || decimalPlaces(rate) > policy.maxDecimalPlaces) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', 'Ключевая ставка вне допустимого диапазона/точности');
        }
        const effectiveAt = parseDate(value.key_rate.effective_from, 'key_rate.effective_from');
        if (effectiveAt > options.now.getTime() + policy.clockSkewMs) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', 'Дата действия ставки находится в будущем');
        }
        if (metadata.payload_checksum_sha256 !== payloadChecksum(value.key_rate)) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', 'payload checksum ставки не совпадает');
        }
        if (value.cb_rate !== rate || value.effective_from !== value.key_rate.effective_from
            || value.fetched_at !== metadata.last_successful_fetch_at) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', 'Compatibility projection ставки расходится с каноническим payload');
        }
    } else if (value.key_rate !== null || value.cb_rate !== null || value.effective_from !== null
        || value.fetched_at !== null || metadata.source_export_url !== null
        || metadata.source_checksum_sha256 !== null || metadata.payload_checksum_sha256 !== null
        || metadata.last_successful_fetch_at !== null) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', 'unavailable не должен содержать финансовый payload или успешный provenance');
    }

    const previous = options.previous;
    if (metadata.status === 'stale' && previous?.key_rate && SUCCESS_STATUSES.has(previous.metadata?.status)) {
        const immutableFields = ['source_export_url', 'source_checksum_sha256', 'payload_checksum_sha256', 'last_successful_fetch_at'];
        if (stableStringify(value.key_rate) !== stableStringify(previous.key_rate)
            || immutableFields.some((field) => metadata[field] !== previous.metadata[field])) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', 'stale изменил payload или provenance ставки');
        }
    }
    if (metadata.status === 'ok' && previous?.key_rate && SUCCESS_STATUSES.has(previous.metadata?.status)) {
        const previousRate = previous.key_rate.value_percent;
        if (value.key_rate.effective_from < previous.key_rate.effective_from) {
            throw new DataValidationError('anomaly', 'jump_requires_review', 'Дата ключевой ставки откатилась назад');
        }
        const change = Math.abs(value.key_rate.value_percent - previousRate);
        if (change > policy.absoluteJumpPercentagePoints || (previousRate > 0 && change / previousRate > policy.relativeJumpRatio)) {
            throw new DataValidationError('anomaly', 'jump_requires_review', 'Изменение ключевой ставки требует ручной проверки');
        }
    }
}

function validateInflationSemantic(value, options) {
    const policy = getPolicy('inflation');
    const { metadata, annual } = value;
    assertStatusMetadata(metadata, options.now, policy.clockSkewMs);
    assertOfficialUrl(metadata.source_url, policy, 'metadata.source_url');
    assertOfficialUrl(metadata.source_landing_url, policy, 'metadata.source_landing_url');

    const expectedMetadata = {
        indicator_id: '31074',
        showcase_indicator_id: '11521100300010200001',
        geography: 'Российская Федерация',
        coverage: 'Все товары и услуги',
        measure: 'декабрь к декабрю предыдущего года',
        unit: 'percent',
        frequency: 'annual'
    };
    for (const [key, expected] of Object.entries(expectedMetadata)) {
        if (metadata[key] !== expected) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', `metadata.${key} не соответствует утвержденному срезу`);
        }
    }

    if (SUCCESS_STATUSES.has(metadata.status)) {
        if (!annual.length || metadata.data_through === null || metadata.source_export_url === null
            || metadata.source_checksum_sha256 === null || metadata.source_published_at === null
            || metadata.last_successful_fetch_at === null) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', `${metadata.status}: отсутствует проверенный ряд/provenance`);
        }
        assertOfficialUrl(metadata.source_export_url, policy, 'metadata.source_export_url');
        const seen = new Set();
        annual.forEach((record, index) => {
            const expectedYear = policy.minYear + index;
            if (record.year !== expectedYear || seen.has(record.year)) {
                throw new DataValidationError('semantic', 'partial_dataset', `Нарушена последовательность годов около ${expectedYear}`);
            }
            seen.add(record.year);
            if (Math.abs(record.inflation_percent - (record.cpi_index - 100)) > 1e-6) {
                throw new DataValidationError('semantic', 'semantic_validation_failed', `ИПЦ и инфляция расходятся за ${record.year}`);
            }
            if (index > 0 && Math.abs(record.inflation_percent - annual[index - 1].inflation_percent) > policy.interYearJumpThreshold) {
                throw new DataValidationError('anomaly', 'jump_requires_review', `Межгодовое изменение за ${record.year} требует проверки`);
            }
        });
        if (annual.at(-1).year !== metadata.data_through) {
            throw new DataValidationError('semantic', 'partial_dataset', 'data_through не совпадает с последним годом ряда');
        }
        const controls = new Map([[2024, [109.52, 9.52]], [2025, [105.59, 5.59]]]);
        for (const [year, [cpi, inflation]] of controls) {
            const record = annual.find((item) => item.year === year);
            if (record && (record.cpi_index !== cpi || record.inflation_percent !== inflation)) {
                throw new DataValidationError('semantic', 'semantic_validation_failed', `Контрольное значение Росстата за ${year} не совпадает`);
            }
        }
    } else if (annual.length !== 0 || metadata.data_through !== null || metadata.source_export_url !== null
        || metadata.source_checksum_sha256 !== null || metadata.source_published_at !== null
        || metadata.last_successful_fetch_at !== null) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', 'unavailable не должен содержать ряд или успешный provenance');
    }

    const previous = options.previous;
    if (metadata.status === 'stale' && previous?.annual && SUCCESS_STATUSES.has(previous.metadata?.status)) {
        const immutableFields = [
            'source_export_url',
            'source_checksum_sha256',
            'source_published_at',
            'last_successful_fetch_at',
            'data_through'
        ];
        if (stableStringify(annual) !== stableStringify(previous.annual)
            || immutableFields.some((field) => metadata[field] !== previous.metadata[field])) {
            throw new DataValidationError('semantic', 'semantic_validation_failed', 'stale изменил ряд или provenance инфляции');
        }
    }
    if (metadata.status === 'ok' && previous?.annual && SUCCESS_STATUSES.has(previous.metadata?.status)) {
        const previousByYear = new Map(previous.annual.map((record) => [record.year, record]));
        for (const record of annual) {
            const oldRecord = previousByYear.get(record.year);
            if (oldRecord && Math.abs(record.inflation_percent - oldRecord.inflation_percent) > policy.historicalRevisionThreshold) {
                throw new DataValidationError('anomaly', 'jump_requires_review', `Ревизия инфляции за ${record.year} требует ручной проверки`);
            }
        }
    }
}

function inflationDeadline(now) {
    const policy = getPolicy('inflation');
    return new Date(Date.UTC(now.getUTCFullYear(), policy.completedYearPublicationMonth - 1,
        policy.completedYearPublicationDay, 23, 59, 59, 999));
}

function validateFreshness(dataset, value, now) {
    const policy = getPolicy(dataset);
    if (value.metadata.status === 'unavailable') return;

    if (dataset === 'rates') {
        const age = now.getTime() - parseDate(value.metadata.last_successful_fetch_at, 'last_successful_fetch_at');
        if (age < -policy.clockSkewMs) {
            throw new DataValidationError('freshness', 'semantic_validation_failed', 'last_successful_fetch_at находится в будущем');
        }
        if (age > policy.hardTtlMs) {
            throw new DataValidationError('freshness', 'freshness_exceeded', 'Ставка превысила hard TTL');
        }
        if (age > policy.softTtlMs && value.metadata.status !== 'stale') {
            throw new DataValidationError('freshness', 'freshness_exceeded', 'Ставка превысила soft TTL без статуса stale');
        }
        return;
    }

    const deadline = inflationDeadline(now);
    const expectedYear = now > deadline ? now.getUTCFullYear() - 1 : now.getUTCFullYear() - 2;
    if (value.metadata.data_through >= expectedYear) return;
    if (now <= deadline) return;
    const lateBy = now.getTime() - deadline.getTime();
    if (lateBy > policy.missingYearHardTtlMs) {
        throw new DataValidationError('freshness', 'freshness_exceeded', 'Годовой ряд инфляции превысил hard TTL');
    }
    if (value.metadata.status !== 'stale') {
        throw new DataValidationError('freshness', 'freshness_exceeded', 'Годовой ряд инфляции просрочен без статуса stale');
    }
}

const SEMANTIC_VALIDATORS = Object.freeze({
    rates: validateRatesSemantic,
    inflation: validateInflationSemantic
});

function validateDataset(dataset, value, options = {}) {
    getPolicy(dataset);
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    if (!Number.isFinite(now.getTime())) throw new Error('Некорректный now для validator');
    validateSchema(dataset, value);
    const semanticOptions = { now, previous: options.previous || null };
    const semanticValidator = SEMANTIC_VALIDATORS[dataset];
    if (!semanticValidator) {
        throw new DataValidationError('semantic', 'semantic_validation_failed', `Нет semantic validator для ${dataset}`);
    }
    semanticValidator(value, semanticOptions);
    if (!options.skipFreshness) validateFreshness(dataset, value, now);
    return value;
}

function unavailableDataset(dataset, now, reason = 'no_saved_dataset') {
    const attemptAt = now.toISOString();
    if (dataset === 'rates') {
        const policy = getPolicy('rates');
        return {
            metadata: {
                schema_version: 2,
                dataset_id: policy.datasetId,
                status: 'unavailable',
                status_reason: reason,
                source_name: 'Банк России',
                source_url: policy.sourceUrl,
                source_export_url: null,
                source_checksum_sha256: null,
                payload_checksum_sha256: null,
                source_published_at: null,
                sources: null,
                last_successful_fetch_at: null,
                last_attempt_at: attemptAt
            },
            key_rate: null,
            cb_rate: null,
            source_url: policy.sourceUrl,
            effective_from: null,
            fetched_at: null,
            status: 'unavailable'
        };
    }
    const policy = getPolicy('inflation');
    return {
        metadata: {
            schema_version: 2,
            status: 'unavailable',
            source_name: 'Росстат / ЕМИСС',
            source_url: policy.sourceUrl,
            source_landing_url: policy.sourceLandingUrl,
            source_export_url: null,
            source_checksum_sha256: null,
            indicator_id: '31074',
            showcase_indicator_id: '11521100300010200001',
            indicator_name: 'Индекс потребительских цен на товары и услуги',
            geography: 'Российская Федерация',
            coverage: 'Все товары и услуги',
            measure: 'декабрь к декабрю предыдущего года',
            unit: 'percent',
            frequency: 'annual',
            data_through: null,
            source_published_at: null,
            last_successful_fetch_at: null,
            last_attempt_at: attemptAt,
            status_reason: reason
        },
        annual: []
    };
}

function canRemainStale(dataset, previous, now) {
    try {
        validateDataset(dataset, previous, { now, skipFreshness: true });
    } catch {
        return false;
    }
    if (!SUCCESS_STATUSES.has(previous.metadata.status)) return false;
    if (dataset === 'rates') {
        return now.getTime() - parseDate(previous.metadata.last_successful_fetch_at, 'last_successful_fetch_at')
            <= getPolicy('rates').hardTtlMs;
    }
    const deadline = inflationDeadline(now);
    const expectedYear = now > deadline ? now.getUTCFullYear() - 1 : now.getUTCFullYear() - 2;
    if (previous.metadata.data_through >= expectedYear) return true;
    return now.getTime() - deadline.getTime() <= getPolicy('inflation').missingYearHardTtlMs;
}

function buildFailureState(dataset, previous, reason, nowValue = new Date()) {
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
    const safeReason = STATUS_REASONS.has(reason) ? reason : 'fetch_failed';
    let hasValidSnapshot = false;
    if (previous) {
        try {
            validateDataset(dataset, previous, { now, skipFreshness: true });
            hasValidSnapshot = SUCCESS_STATUSES.has(previous.metadata.status);
        } catch {
            hasValidSnapshot = false;
        }
    }
    if (!hasValidSnapshot || !canRemainStale(dataset, previous, now)) {
        const unavailableReason = hasValidSnapshot ? 'freshness_exceeded' : 'no_saved_dataset';
        const unavailable = unavailableDataset(dataset, now, unavailableReason);
        validateDataset(dataset, unavailable, { now });
        return unavailable;
    }

    const stale = JSON.parse(JSON.stringify(previous));
    stale.metadata.status = 'stale';
    stale.metadata.status_reason = safeReason;
    stale.metadata.last_attempt_at = now.toISOString();
    if (dataset === 'rates') stale.status = 'stale';
    validateDataset(dataset, stale, { now });
    return stale;
}

function atomicWriteJson(dataset, outputPath, value, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    validateDataset(dataset, value, { now, previous: options.previous || null });
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    const reparsed = parseJsonStrict(serialized, outputPath);
    validateDataset(dataset, reparsed, { now, previous: options.previous || null });

    const temporaryPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    let descriptor;
    try {
        descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
        fs.writeFileSync(descriptor, serialized, 'utf8');
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.renameSync(temporaryPath, outputPath);
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    }
}

function readAndValidateFile(dataset, filePath, options = {}) {
    const value = parseJsonStrict(fs.readFileSync(filePath, 'utf8'), filePath);
    return validateDataset(dataset, value, options);
}

function runCli(argv = process.argv.slice(2)) {
    if (!argv.includes('--all')) {
        throw new Error('Поддерживается только явный запуск --all для всех зарегистрированных наборов');
    }
    const now = new Date();
    const modeIndex = argv.indexOf('--mode');
    const mode = modeIndex === -1 ? 'publish' : argv[modeIndex + 1];
    if (!['publish', 'health'].includes(mode)) throw new Error(`Неизвестный mode: ${mode}`);
    const unhealthy = [];
    for (const [dataset, policy] of Object.entries(DATASET_POLICIES)) {
        const value = readAndValidateFile(dataset, policy.dataPath, { now });
        console.log(`[data-validation] ${dataset}: schema + semantic + freshness OK`);
        if (value.metadata.status !== 'ok') unhealthy.push(`${dataset}=${value.metadata.status}`);
    }
    console.log('[data-validation] regions: not registered; migration intentionally deferred to P0.4');
    if (mode === 'health' && unhealthy.length) {
        throw new Error(`Требуется внимание: ${unhealthy.join(', ')}`);
    }
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        const details = error.details?.length ? `\n- ${error.details.join('\n- ')}` : '';
        console.error(`[data-validation] FAIL ${error.stage || 'runtime'}/${error.reason || 'error'}: ${error.message}${details}`);
        process.exitCode = 1;
    }
}

module.exports = {
    DataValidationError,
    atomicWriteJson,
    buildFailureState,
    parseJsonStrict,
    payloadChecksum,
    readAndValidateFile,
    stableStringify,
    unavailableDataset,
    validateDataset,
    validateFreshness,
    validateSchema
};
