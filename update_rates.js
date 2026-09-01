'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    DataValidationError,
    atomicWriteJson,
    buildFailureState,
    parseJsonStrict,
    payloadChecksum,
    validateDataset
} = require('./data_validation/validate');

const API_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';
const SOURCE_URL = 'https://www.cbr.ru/hd_base/keyrate/';
const RATES_PATH = path.join(__dirname, 'rates.json');
const KEY_RATE_HISTORY_START = '2013-09-01';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

class DataSourceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DataSourceError';
        this.code = code;
    }
}

function isOfficialCbrUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && ['www.cbr.ru', 'cbr.ru'].includes(url.hostname.toLowerCase());
    } catch {
        return false;
    }
}

function parseKeyRateXml(xmlText) {
    const entries = [];
    const byDate = new Map();
    const entryPattern = /<KR>\s*<DT>([^<]+)<\/DT>\s*<Rate>([^<]+)<\/Rate>\s*<\/KR>/g;
    let match;

    while ((match = entryPattern.exec(xmlText)) !== null) {
        const effectiveDate = match[1].slice(0, 10);
        const rate = Number(match[2].replace(',', '.'));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !Number.isFinite(rate)) continue;
        if (byDate.has(effectiveDate) && byDate.get(effectiveDate) !== rate) {
            throw new DataSourceError('semantic_validation_failed', `Банк России вернул разные ставки за ${effectiveDate}`);
        }
        byDate.set(effectiveDate, rate);
        entries.push({ effectiveDate, rate });
    }

    if (entries.length === 0) {
        throw new DataSourceError('source_format_changed', 'Ответ Банка России не содержит данных ключевой ставки');
    }

    entries.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    const latest = entries[0];
    let effectiveFrom = latest.effectiveDate;

    for (const entry of entries) {
        if (entry.rate !== latest.rate) break;
        effectiveFrom = entry.effectiveDate;
    }

    return {
        valuePercent: latest.rate,
        effectiveFrom
    };
}

function parseControlRateHtml(html) {
    const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const row of rows) {
        const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
            .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim());
        if (cells.length < 2 || !/^\d{2}\.\d{2}\.\d{4}$/.test(cells[0])) continue;
        const rate = Number(cells[1].replace(',', '.'));
        if (Number.isFinite(rate)) return rate;
    }
    throw new DataSourceError('source_format_changed', 'Контрольная страница Банка России не содержит текущую ставку');
}

function readSavedRates(ratesPath = RATES_PATH) {
    try {
        return parseJsonStrict(fs.readFileSync(ratesPath, 'utf8'), ratesPath);
    } catch {
        return null;
    }
}

function buildSoapRequest(toDate) {
    return [
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
        '<soap:Body>',
        '<KeyRateXML xmlns="http://web.cbr.ru/">',
        `<fromDate>${KEY_RATE_HISTORY_START}</fromDate>`,
        `<ToDate>${toDate}</ToDate>`,
        '</KeyRateXML>',
        '</soap:Body>',
        '</soap:Envelope>'
    ].join('');
}

async function fetchTextWithPolicy(url, requestOptions, fetchImpl, redirects = 0) {
    if (!isOfficialCbrUrl(url)) throw new DataSourceError('fetch_failed', `Недопустимый URL Банка России: ${url}`);
    if (redirects > 3) throw new DataSourceError('fetch_failed', 'Превышен лимит redirect Банка России');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetchImpl(url, { ...requestOptions, redirect: 'manual', signal: controller.signal });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) throw new DataSourceError('http_error', 'Redirect Банка России не содержит Location');
            return fetchTextWithPolicy(new URL(location, url).toString(), requestOptions, fetchImpl, redirects + 1);
        }
        if (!response.ok) throw new DataSourceError('http_error', `Банк России вернул HTTP ${response.status}`);

        const declaredLength = Number(response.headers.get('content-length') || 0);
        if (declaredLength > MAX_RESPONSE_BYTES) throw new DataSourceError('source_format_changed', 'Ответ Банка России слишком большой');
        const body = Buffer.from(await response.arrayBuffer());
        if (!body.length || body.length > MAX_RESPONSE_BYTES) throw new DataSourceError('source_format_changed', 'Некорректный размер ответа Банка России');
        return {
            body,
            contentType: String(response.headers.get('content-type') || '').toLowerCase(),
            url
        };
    } catch (error) {
        if (error.name === 'AbortError') throw new DataSourceError('timeout', 'Таймаут Банка России');
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchOfficialRate(fetchImpl = fetch, now = new Date()) {
    const toDate = now.toISOString().slice(0, 10);
    const soapResponse = await fetchTextWithPolicy(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: 'http://web.cbr.ru/KeyRateXML',
            'User-Agent': 'CalcHub rates updater'
        },
        body: buildSoapRequest(toDate)
    }, fetchImpl);
    if (!/(?:xml|soap)/.test(soapResponse.contentType)) {
        throw new DataSourceError('source_format_changed', 'SOAP endpoint Банка России вернул неожиданный Content-Type');
    }
    const official = parseKeyRateXml(soapResponse.body.toString('utf8'));

    const controlResponse = await fetchTextWithPolicy(SOURCE_URL, {
        method: 'GET',
        headers: { Accept: 'text/html', 'User-Agent': 'CalcHub rates updater' }
    }, fetchImpl);
    if (!controlResponse.contentType.includes('text/html')) {
        throw new DataSourceError('source_format_changed', 'Контрольная страница Банка России вернула неожиданный Content-Type');
    }
    const controlRate = parseControlRateHtml(controlResponse.body.toString('utf8'));
    if (controlRate !== official.valuePercent) {
        throw new DataSourceError('semantic_validation_failed', 'SOAP и контрольная страница Банка России расходятся');
    }

    return {
        ...official,
        sourceChecksum: crypto.createHash('sha256').update(soapResponse.body).digest('hex')
    };
}

function statusReason(error) {
    if (error instanceof DataValidationError) return error.reason;
    if (error instanceof DataSourceError) return error.code;
    if (error?.code?.startsWith('ERR_TLS') || ['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error?.code)) return 'tls_error';
    if (error?.code === 'ETIMEDOUT' || error?.code === 'UND_ERR_CONNECT_TIMEOUT') return 'timeout';
    return 'fetch_failed';
}

function buildOkDataset(officialRate, attemptAt) {
    const keyRate = {
        value_percent: officialRate.valuePercent,
        effective_from: officialRate.effectiveFrom
    };
    return {
        metadata: {
            schema_version: 2,
            dataset_id: 'key_rate',
            status: 'ok',
            status_reason: null,
            source_name: 'Банк России',
            source_url: SOURCE_URL,
            source_export_url: API_URL,
            source_checksum_sha256: officialRate.sourceChecksum,
            payload_checksum_sha256: payloadChecksum(keyRate),
            source_published_at: null,
            sources: null,
            last_successful_fetch_at: attemptAt,
            last_attempt_at: attemptAt
        },
        key_rate: keyRate,
        // Temporary compatibility projection for current consumers. Canonical data is key_rate.
        cb_rate: keyRate.value_percent,
        source_url: SOURCE_URL,
        effective_from: keyRate.effective_from,
        fetched_at: attemptAt,
        status: 'ok'
    };
}

async function buildRatesData(options = {}) {
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const previousData = options.previousData === undefined
        ? readSavedRates(options.ratesPath || RATES_PATH)
        : options.previousData;

    try {
        const loader = options.loader || (() => fetchOfficialRate(options.fetchImpl || fetch, now));
        const candidate = buildOkDataset(await loader(), now.toISOString());
        validateDataset('rates', candidate, { now, previous: previousData });
        return candidate;
    } catch (error) {
        const reason = statusReason(error);
        console.error(`Не удалось получить и проверить ключевую ставку (${reason}): ${error.message}`);
        return buildFailureState('rates', previousData, reason, now);
    }
}

async function updateRates(options = {}) {
    const ratesPath = options.ratesPath || RATES_PATH;
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const previous = options.previousData === undefined ? readSavedRates(ratesPath) : options.previousData;
    const finalData = await buildRatesData({ ...options, ratesPath, previousData: previous, now });
    atomicWriteJson('rates', ratesPath, finalData, { now, previous });
    console.log(`rates.json: ${finalData.metadata.status}`);
    return finalData;
}

if (require.main === module) {
    updateRates().catch((error) => {
        console.error('Не удалось безопасно обновить rates.json:', error);
        process.exitCode = 1;
    });
}

module.exports = {
    API_URL,
    SOURCE_URL,
    DataSourceError,
    buildRatesData,
    fetchOfficialRate,
    parseControlRateHtml,
    parseKeyRateXml,
    updateRates
};
